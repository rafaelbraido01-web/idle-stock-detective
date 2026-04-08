import { useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useInventory } from '@/store/InventoryContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

// Proxy via edge function to avoid CORS issues

function getCategoriaEstoque(dias: number): string {
  if (dias < 0) return 'sem-registro';
  if (dias <= 90) return '0-90';
  if (dias <= 180) return '90-180';
  if (dias <= 270) return '180-270';
  if (dias <= 365) return '270-365';
  return '365+';
}

function calcDias(dateStr: string | null, ref: Date): number {
  if (!dateStr) return -1;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return -1;
  return Math.max(0, Math.floor((ref.getTime() - d.getTime()) / 86400000));
}

export function SyncERPButton() {
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { reload } = useInventory();
  const { toast } = useToast();

  const handleConfirm = async () => {
    setDialogOpen(false);
    setLoading(true);

    try {
      const now = new Date();

      // 1. Call n8n webhook
      const { data: webhookData, error: webhookError } = await supabase.functions.invoke('sync-erp-webhook', {
        body: { data_sync: now.toISOString() },
      });

      if (webhookError) throw new Error(webhookError.message || 'Erro ao chamar webhook');
      if (webhookData?.error) throw new Error(webhookData.error);

      // Parse response: expect [{ status, resumo, produtos }] or { produtos }
      const data = webhookData;
      const wrapper = Array.isArray(data) ? data[0] : data;
      const resumo = wrapper?.resumo || {};
      const rows = wrapper?.produtos || wrapper?.data || (Array.isArray(data) && !wrapper?.resumo ? data : []);

      if (!rows.length) {
        toast({
          title: 'Sincronização concluída',
          description: 'Nenhum dado retornado pelo webhook.',
        });
        return;
      }

      // Use data_execucao from resumo as the import date
      const dataExecucao = resumo.data_execucao ? new Date(resumo.data_execucao) : now;
      const importDateISO = dataExecucao.toISOString();

      // 2. Build produto records and upsert
      const produtosMap = new Map<string, {
        codigo: string; descricao: string; grupo: string; subgrupo: string; marca: string;
      }>();

      for (const row of rows) {
        const codigo = String(row.codigo || row.code || '');
        if (!codigo) continue;
        if (!produtosMap.has(codigo)) {
          produtosMap.set(codigo, {
            codigo,
            descricao: String(row.descricao || row.description || ''),
            grupo: String(row.grupo || row.group || ''),
            subgrupo: String(row.subgrupo || ''),
            marca: String(row.marca || row.brand || ''),
          });
        }
      }

      // Upsert produtos in batches
      const produtoRows = Array.from(produtosMap.values()).map((p) => ({
        codigo: p.codigo,
        descricao: p.descricao,
        grupo: p.grupo,
        subgrupo: p.subgrupo,
        marca: p.marca,
        estoque_minimo: 0,
      }));

      for (let i = 0; i < produtoRows.length; i += 500) {
        const batch = produtoRows.slice(i, i + 500);
        const { error } = await supabase.from('produtos').upsert(batch, { onConflict: 'codigo' });
        if (error) throw new Error(`Erro ao inserir produtos: ${error.message}`);
      }

      // Fetch all produto IDs
      const codigoToId = new Map<string, string>();
      let pgFrom = 0;
      let pgMore = true;
      while (pgMore) {
        const { data: pData } = await supabase.from('produtos').select('id, codigo').range(pgFrom, pgFrom + 999);
        const r = pData || [];
        for (const p of r) codigoToId.set(p.codigo, p.id);
        pgMore = r.length === 1000;
        pgFrom += 1000;
      }

      // 3. Build snapshot
      const snapshotId = crypto.randomUUID();
      let totalValorEstoque = 0;
      const snapshotRows: any[] = [];

      for (const row of rows) {
        const codigo = String(row.codigo || row.code || '');
        const produtoId = codigoToId.get(codigo);
        if (!produtoId) continue;

        const quantidade = Number(row.quantidade || row.quantity || 0);
        const valorUnit = Number(row.valor_unitario || row.unit_value || 0);
        const valorTotal = Number(row.valor_total || row.total_value || quantidade * valorUnit);
        const dataUltimaVenda = row.data_ultima_venda || row.last_sale_date || null;
        const dataUltimaCompra = row.data_ultima_compra || row.last_purchase_date || null;
        const diasSemVenda = calcDias(dataUltimaVenda, dataExecucao);
        const diasSemCompra = calcDias(dataUltimaCompra, dataExecucao);
        const precoTabela = Number(row.preco_tabela || row.list_price || 0);
        const promoRaw = Number(row.valor_promocao || 0);
        const valorPromocao = promoRaw > 0 ? promoRaw : null;
        const dataFimPromocao = row.data_fim_promocao || null;

        let percentualDesconto: number | null = null;
        if (valorPromocao && precoTabela > 0) {
          percentualDesconto = Math.round(((precoTabela - valorPromocao) / precoTabela) * 10000) / 100;
        }

        totalValorEstoque += valorTotal;

        snapshotRows.push({
          snapshot_id: snapshotId,
          produto_id: produtoId,
          quantidade,
          valor_unitario: valorUnit,
          valor_total: valorTotal,
          data_ultima_venda: dataUltimaVenda,
          data_ultima_compra: dataUltimaCompra,
          dias_sem_venda: diasSemVenda,
          dias_sem_compra: diasSemCompra,
          categoria_estoque: getCategoriaEstoque(diasSemVenda >= 0 ? diasSemVenda : diasSemCompra),
          nome_comissao: String(row.nome_comissao || ''),
          comissao: Number(row.comissao || 0),
          preco_tabela: precoTabela,
          valor_promocao: valorPromocao,
          percentual_desconto: percentualDesconto,
          data_fim_promocao: dataFimPromocao,
          valor_venda_total: 0,
        });
      }

      // Insert snapshot header
      const { error: snapErr } = await supabase.from('estoque_snapshots').insert({
        id: snapshotId,
        data_importacao: importDateISO,
        nome_arquivo: `Sync ERP (n8n) - ${importDateISO.split('T')[0]}`,
        usuario: 'Sync ERP',
        data_criacao: importDateISO,
        total_produtos: snapshotRows.length,
        valor_total: totalValorEstoque,
      });
      if (snapErr) throw new Error(`Erro ao criar snapshot: ${snapErr.message}`);

      // Insert produto snapshots in batches
      for (let i = 0; i < snapshotRows.length; i += 500) {
        const batch = snapshotRows.slice(i, i + 500);
        const { error } = await supabase.from('estoque_produto_snapshots').insert(batch);
        if (error) throw new Error(`Erro ao inserir snapshots: ${error.message}`);
      }

      await reload();

      toast({
        title: 'Sincronização concluída',
        description: `${snapshotRows.length} produtos sincronizados via webhook.`,
        duration: 10000,
      });
    } catch (err: any) {
      toast({
        title: 'Erro na sincronização',
        description: err.message || 'Erro ao conectar com o webhook.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setDialogOpen(true)}
        disabled={loading}
        variant="outline"
        className="gap-2 shadow-subtle"
        size="sm"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {loading ? 'Sincronizando...' : 'Sincronizar ERP'}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) setDialogOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sincronizar com ERP</DialogTitle>
            <DialogDescription>
              Deseja iniciar a sincronização dos dados do ERP? A data atual será enviada como referência.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirm}>Sincronizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
