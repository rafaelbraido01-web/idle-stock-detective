import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useInventory } from '@/store/InventoryContext';
import { AgingBadge } from '@/components/AgingBadge';
import { formatCurrency, formatNumber, formatDate, parseLocalDate } from '@/types/inventory';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { Tag, TrendingDown } from 'lucide-react';

interface CampanhaRecord {
  id: string;
  campanha: string;
  canal: string;
  data_inicio: string;
  data_fim: string;
}

interface PrecoMercadoRecord {
  id: string;
  fonte: string;
  preco: number;
  updated_at: string;
}

interface ProductDrawerProps {
  produtoId: string | null;
  onClose: () => void;
}

export function ProductDrawer({ produtoId, onClose }: ProductDrawerProps) {
  const { produtos, getProdutoHistory, getLatestProdutoSnapshots } = useInventory();
  const produto = produtos.find(p => p.id === produtoId);
  const history = produtoId ? getProdutoHistory(produtoId) : [];
  const latestSnap = getLatestProdutoSnapshots().find(ps => ps.produto_id === produtoId);

  const [campanhas, setCampanhas] = useState<CampanhaRecord[]>([]);
  const [precosMercado, setPrecosMercado] = useState<PrecoMercadoRecord[]>([]);

  useEffect(() => {
    if (!produto) { setCampanhas([]); setPrecosMercado([]); return; }
    const codigo = produto.codigo;

    supabase.from('campanhas_produto').select('*')
      .eq('produto_id', codigo)
      .order('data_fim', { ascending: false })
      .then(({ data }) => setCampanhas((data as CampanhaRecord[]) || []));

    supabase.from('precos_mercado').select('*')
      .eq('produto_id', codigo)
      .order('updated_at', { ascending: false })
      .then(({ data }) => setPrecosMercado((data as PrecoMercadoRecord[]) || []));
  }, [produto]);

  const chartData = history.map(h => ({
    data: new Date(h.data_importacao).toLocaleDateString('pt-BR'),
    quantidade: h.quantidade,
    valor: h.valor_total,
    dias: h.dias_sem_venda >= 9999 ? null : h.dias_sem_venda,
  }));

  return (
    <Sheet open={!!produtoId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {produto && latestSnap && (
          <>
            <SheetHeader className="mb-6">
              <SheetTitle className="flex items-center gap-3">
                <span className="font-mono text-sm text-muted-foreground">{produto.codigo}</span>
                <AgingBadge dias={latestSnap.dias_sem_venda} />
              </SheetTitle>
              <p className="text-sm text-foreground">{produto.descricao}</p>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                {produto.grupo && <span>Grupo: {produto.grupo}</span>}
                {produto.marca && <span>Marca: {produto.marca}</span>}
              </div>
            </SheetHeader>

            {/* Current stats */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Quantidade</p>
                <p className={`text-lg font-mono font-semibold ${latestSnap.quantidade >= 100 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                  {formatNumber(latestSnap.quantidade)}
                  {latestSnap.quantidade >= 100 && <span className="ml-1 text-sm">🔥</span>}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Custo Médio</p>
                <p className="text-lg font-mono font-semibold">{formatCurrency(latestSnap.valor_unitario)}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Preço Tabela</p>
                <p className="text-lg font-mono font-semibold">{latestSnap.preco_tabela > 0 ? formatCurrency(latestSnap.preco_tabela) : '—'}</p>
              </div>
              {latestSnap.valor_promocao ? (
                <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 border border-green-200 dark:border-green-800">
                  <p className="text-[10px] uppercase tracking-wider text-green-700 dark:text-green-400 font-medium">Promoção</p>
                  <p className="text-lg font-mono font-semibold text-green-700 dark:text-green-400">{formatCurrency(latestSnap.valor_promocao)}</p>
                  {latestSnap.percentual_desconto && (
                    <p className="text-xs font-mono text-green-600 dark:text-green-500">-{latestSnap.percentual_desconto.toFixed(1)}% de desconto</p>
                  )}
                  {latestSnap.data_fim_promocao && (
                    <p className="text-[10px] text-green-600 dark:text-green-500 mt-1">Válido até {formatDate(latestSnap.data_fim_promocao)}</p>
                  )}
                </div>
              ) : (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Promoção</p>
                  <p className="text-sm font-mono text-muted-foreground">Sem promoção</p>
                </div>
              )}
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Valor em Estoque</p>
                <p className="text-lg font-mono font-semibold">{formatCurrency(latestSnap.valor_total)}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Valor Venda (total vida)</p>
                <p className="text-lg font-mono font-semibold">{latestSnap.valor_venda_total > 0 ? formatCurrency(latestSnap.valor_venda_total) : '—'}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Última Venda</p>
                <p className="text-sm font-mono">{latestSnap.data_ultima_venda ? formatDate(latestSnap.data_ultima_venda) : '—'}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Última Compra</p>
                <p className="text-sm font-mono">{latestSnap.data_ultima_compra ? formatDate(latestSnap.data_ultima_compra) : '—'}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Dias s/ Venda</p>
                <p className="text-lg font-mono font-semibold">{latestSnap.dias_sem_venda < 0 ? '—' : latestSnap.dias_sem_venda}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Dias s/ Compra</p>
                <p className="text-lg font-mono font-semibold">{latestSnap.dias_sem_compra < 0 ? '—' : latestSnap.dias_sem_compra}</p>
              </div>
              {latestSnap.nome_comissao && (
                <div className="bg-muted/50 rounded-lg p-3 col-span-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Comissão</p>
                  <p className="text-sm font-mono font-semibold">
                    {latestSnap.nome_comissao}
                    {latestSnap.comissao > 0 && <span className="text-muted-foreground ml-2">({latestSnap.comissao}%)</span>}
                  </p>
                </div>
              )}
            </div>

            {/* History charts */}
            {chartData.length > 1 && (
              <div className="space-y-6">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Evolução da Quantidade</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                      <XAxis dataKey="data" tick={{ fontSize: 10 }} stroke="hsl(215 16% 47%)" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(215 16% 47%)" />
                      <Tooltip />
                      <Line type="monotone" dataKey="quantidade" stroke="hsl(222 47% 11%)" strokeWidth={2} dot={{ r: 3 }} name="Qtd" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Evolução do Valor</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                      <XAxis dataKey="data" tick={{ fontSize: 10 }} stroke="hsl(215 16% 47%)" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(215 16% 47%)" tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Line type="monotone" dataKey="valor" stroke="hsl(38 92% 40%)" strokeWidth={2} dot={{ r: 3 }} name="Valor" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {chartData.length <= 1 && (
              <div className="border border-dashed rounded-lg p-6 text-center">
                <p className="text-xs text-muted-foreground">Importe mais relatórios para ver o histórico de evolução</p>
              </div>
            )}

            {/* Campanhas realizadas */}
            <div className="mt-6">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" /> Campanhas Realizadas
              </p>
              {campanhas.length > 0 ? (
                <div className="space-y-2">
                  {campanhas.map(c => {
                    const hoje = new Date();
                    const inicio = new Date(c.data_inicio + 'T00:00:00');
                    const fim = new Date(c.data_fim + 'T23:59:59');
                    const status = inicio > hoje ? 'Futura' : fim >= hoje ? 'Ativa' : 'Encerrada';
                    const statusClass = status === 'Ativa'
                      ? 'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200'
                      : status === 'Futura'
                        ? 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
                        : 'bg-muted text-muted-foreground';
                    const cardClass = status === 'Ativa'
                      ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
                      : status === 'Futura'
                        ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
                        : 'bg-muted/50 border-border';
                    return (
                      <div key={c.id} className={`rounded-lg p-3 border text-sm ${cardClass}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{c.campanha || 'Sem nome'}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusClass}`}>
                            {status}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {c.canal} · {formatDate(c.data_inicio)} → {formatDate(c.data_fim)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="border border-dashed rounded-lg p-4 text-center">
                  <p className="text-xs text-muted-foreground">Nenhuma campanha registrada</p>
                </div>
              )}
            </div>

            {/* Histórico de preço de mercado */}
            <div className="mt-6 mb-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5" /> Histórico de Preço de Mercado
              </p>
              {precosMercado.length > 0 ? (
                <div className="space-y-2">
                  {precosMercado.map(pm => (
                    <div key={pm.id} className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium">{pm.fonte}</span>
                        <p className="text-[10px] text-muted-foreground">{new Date(pm.updated_at).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <span className="text-sm font-mono font-semibold">{formatCurrency(pm.preco)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-dashed rounded-lg p-4 text-center">
                  <p className="text-xs text-muted-foreground">Nenhum preço de mercado pesquisado</p>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
