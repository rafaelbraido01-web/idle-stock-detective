import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calendar as CalendarIcon, Check, ChevronDown, Copy, FileDown, RefreshCw, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useInventory } from '@/store/InventoryContext';
import { useAlertasConfig } from '@/hooks/useAlertasConfig';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, parseLocalDate } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ProductDrawer } from '@/components/ProductDrawer';
import { MarketPriceUpdateDialog } from '@/components/MarketPriceUpdateDialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type Severity = 'red' | 'amber' | 'green';
type SortKey = 'recente' | 'valor' | 'antigo' | 'marca' | 'preco_recente' | 'preco_antigo' | 'estoque_desc' | 'estoque_asc';

interface PrecoMercadoMap {
  [produtoCodigo: string]: { preco: number; updated_at: string };
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

function formatDateBR(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString('pt-BR');
}

export default function Alertas() {
  const { produtos, getLatestProdutoSnapshots, getLatestSnapshot, loading } = useInventory();
  const { config } = useAlertasConfig();
  const { toast } = useToast();

  const [precosMap, setPrecosMap] = useState<PrecoMercadoMap>({});
  const [search, setSearch] = useState('');
  const [marcaFilter, setMarcaFilter] = useState<string[]>(config.marcasPadrao);
  const [marcaSearch, setMarcaSearch] = useState('');
  const [tipoEstoqueOnly, setTipoEstoqueOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('recente');
  const [drawerProdutoId, setDrawerProdutoId] = useState<string | null>(null);
  const [desdeData, setDesdeData] = useState<Date | undefined>(undefined);
  const [updateTarget, setUpdateTarget] = useState<{ codigo: string; descricao: string; marca: string; precoTabela: number } | null>(null);
  const [showPdfConfirm, setShowPdfConfirm] = useState(false);

  // Sync default brands when config loads first time
  useEffect(() => {
    if (config.marcasPadrao.length > 0 && marcaFilter.length === 0) {
      setMarcaFilter(config.marcasPadrao);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.marcasPadrao.join('|')]);

  // Load latest market price per product
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('precos_mercado')
        .select('produto_id, preco, updated_at')
        .order('updated_at', { ascending: false });
      if (cancelled || !data) return;
      const map: PrecoMercadoMap = {};
      for (const row of data as any[]) {
        if (!map[row.produto_id]) {
          map[row.produto_id] = { preco: Number(row.preco), updated_at: row.updated_at };
        }
      }
      setPrecosMap(map);
    })();
    return () => { cancelled = true; };
  }, []);

  const latestSnap = getLatestSnapshot();
  const latestProdSnaps = useMemo(() => getLatestProdutoSnapshots(), [getLatestProdutoSnapshots]);
  const produtoMap = useMemo(() => new Map(produtos.map(p => [p.id, p])), [produtos]);
  const marcas = useMemo(
    () => [...new Set(produtos.map(p => p.marca).filter(Boolean))].sort(),
    [produtos]
  );

  const alertas = useMemo(() => {
    const now = new Date();
    const result: Array<{
      ps: typeof latestProdSnaps[number];
      produto: ReturnType<typeof produtoMap.get>;
      severity: Severity;
      precoMercadoDias: number | null;
      precoMercadoValor: number | null;
      regras: string[];
    }> = [];

    for (const ps of latestProdSnaps) {
      const produto = produtoMap.get(ps.produto_id);
      if (!produto) continue;

      const regras: string[] = [];

      // Regra A: estoque parado
      if (
        config.estoqueParado.enabled &&
        ps.dias_sem_compra >= config.estoqueParado.diasMin &&
        ps.valor_total >= config.estoqueParado.valorMin &&
        ps.quantidade >= (config.estoqueParado.estoqueMin ?? 0)
      ) {
        regras.push(`Parado +${config.estoqueParado.diasMin}d`);
      }

      // Preço de mercado
      const pm = precosMap[produto.codigo];
      const pmDias = pm ? daysBetween(parseLocalDate(pm.updated_at.slice(0, 10)), now) : null;

      let precoSev: Severity = 'green';
      if (!pm) precoSev = 'red';
      else if (pmDias! > config.precoMercado.diasVermelho) precoSev = 'red';
      else if (pmDias! > config.precoMercado.diasVerde) precoSev = 'amber';

      // Regra B
      if (config.precoMercado.enabled && (precoSev === 'red')) {
        regras.push(pm ? `Preço desatualizado +${config.precoMercado.diasVermelho}d` : 'Sem preço de mercado');
      }

      // Regra C: preço pesquisado dentro do intervalo selecionado (filtro de data)
      if (desdeData && pm) {
        const desdeMs = new Date(desdeData.getFullYear(), desdeData.getMonth(), desdeData.getDate()).getTime();
        const updMs = parseLocalDate(pm.updated_at.slice(0, 10)).getTime();
        if (updMs >= desdeMs) {
          regras.push(`Preço pesquisado em ${format(parseLocalDate(pm.updated_at.slice(0, 10)), 'dd/MM/yyyy')}`);
        }
      }

      if (regras.length === 0) continue;

      // Severidade do card baseada em quantas regras de alerta dispararam
      // - Vermelho: ambas (estoque parado + preço sem registro/desatualizado)
      // - Amarelo: apenas uma das regras dispara
      const paradoAtivo = regras.some(r => r.startsWith('Parado'));
      const precoAtivo = regras.some(r => r.includes('preço') || r.includes('Preço'));
      const severity: Severity = (paradoAtivo && precoAtivo) ? 'red' : 'amber';

      result.push({
        ps,
        produto,
        severity,
        precoMercadoDias: pmDias,
        precoMercadoValor: pm?.preco ?? null,
        regras,
      });
    }
    return result;
  }, [latestProdSnaps, produtoMap, precosMap, config, desdeData]);

  const filtered = useMemo(() => {
    let arr = alertas;

    if (search.trim()) {
      const s = search.toLowerCase();
      arr = arr.filter(a =>
        a.produto!.codigo.toLowerCase().includes(s) ||
        a.produto!.descricao.toLowerCase().includes(s)
      );
    }

    if (marcaFilter.length > 0) {
      arr = arr.filter(a => a.produto!.marca && marcaFilter.includes(a.produto!.marca));
    }

    if (tipoEstoqueOnly) {
      arr = arr.filter(a => a.regras.some(r => r.startsWith('Parado')));
    }

    if (desdeData) {
      const desdeMs = new Date(desdeData.getFullYear(), desdeData.getMonth(), desdeData.getDate()).getTime();
      arr = arr.filter(a => {
        const pm = precosMap[a.produto!.codigo];
        if (!pm) return false;
        const upd = parseLocalDate(pm.updated_at.slice(0, 10)).getTime();
        return upd >= desdeMs;
      });
    }

    arr = [...arr].sort((a, b) => {
      if (sortKey === 'valor') return b.ps.valor_total - a.ps.valor_total;
      if (sortKey === 'antigo') return b.ps.dias_sem_compra - a.ps.dias_sem_compra;
      if (sortKey === 'estoque_desc') return b.ps.quantidade - a.ps.quantidade;
      if (sortKey === 'estoque_asc') return a.ps.quantidade - b.ps.quantidade;
      if (sortKey === 'recente') {
        const ad = a.ps.data_ultima_compra ? parseLocalDate(a.ps.data_ultima_compra).getTime() : 0;
        const bd = b.ps.data_ultima_compra ? parseLocalDate(b.ps.data_ultima_compra).getTime() : 0;
        return bd - ad;
      }
      if (sortKey === 'preco_recente') {
        const ad = a.precoMercadoDias === null ? Number.POSITIVE_INFINITY : a.precoMercadoDias;
        const bd = b.precoMercadoDias === null ? Number.POSITIVE_INFINITY : b.precoMercadoDias;
        return ad - bd;
      }
      if (sortKey === 'preco_antigo') {
        const ad = a.precoMercadoDias === null ? Number.POSITIVE_INFINITY : a.precoMercadoDias;
        const bd = b.precoMercadoDias === null ? Number.POSITIVE_INFINITY : b.precoMercadoDias;
        return bd - ad;
      }
      return (a.produto!.marca || '').localeCompare(b.produto!.marca || '');
    });

    return arr;
  }, [alertas, search, marcaFilter, tipoEstoqueOnly, sortKey, desdeData, precosMap]);

  const kpis = useMemo(() => ({
    total: filtered.length,
    valorTotal: filtered.reduce((sum, a) => sum + a.ps.valor_total, 0),
    semPreco: filtered.filter(a => a.precoMercadoValor === null).length,
  }), [filtered]);

  const handleCopy = () => {
    const codigos = filtered.map(a => a.produto!.codigo).join('\n');
    navigator.clipboard.writeText(codigos);
    toast({ title: 'Códigos copiados', description: `${filtered.length} códigos na área de transferência.` });
  };

  const generatePDF = () => {
    const doc = new jsPDF('landscape');
    const tableData = filtered.map(a => [
      a.produto!.codigo,
      a.produto!.descricao,
      a.produto!.marca || '',
      formatCurrency(a.ps.valor_total),
      a.ps.quantidade.toString(),
      a.ps.data_ultima_compra ? formatDateBR(a.ps.data_ultima_compra) : '—',
      a.ps.dias_sem_compra.toString(),
      a.regras.join(', ')
    ]);

    doc.text('Relatório de Alertas de Inventário', 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 22);

    autoTable(doc, {
      startY: 25,
      head: [['Código', 'Descrição', 'Marca', 'Valor Total', 'Qtd', 'Últ. Compra', 'Dias S/ Compra', 'Alertas']],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [66, 66, 66] }
    });

    doc.save(`alertas-inventario-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const handlePdfRequest = () => {
    if (filtered.length > 100) {
      setShowPdfConfirm(true);
    } else {
      generatePDF();
    }
  };

  if (loading) {
    return <div className="text-muted-foreground text-sm">Carregando alertas...</div>;
  }

  if (!latestSnap) {
    return (
      <div className="text-center py-20">
        <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Nenhum snapshot disponível. Importe um relatório para gerar alertas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-aging-alert" />
            Alertas
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {kpis.total} {kpis.total === 1 ? 'alerta exibido' : 'alertas exibidos'} · snapshot de {formatDateBR(latestSnap.data_importacao.slice(0, 10))}
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Button variant="outline" size="sm" onClick={handlePdfRequest} disabled={filtered.length === 0} className="border-primary/20 hover:border-primary/50">
            <FileDown className="h-4 w-4 mr-2" /> Gerar PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopy} disabled={filtered.length === 0}>
            <Copy className="h-4 w-4 mr-2" /> Copiar códigos
          </Button>
        </div>
      </div>

      {/* KPIs glass */}
      <div className="grid gap-4 md:grid-cols-3">
        <GlassKpi label="Alertas ativos" value={kpis.total.toString()} accent="amber" />
        <GlassKpi label="Valor em estoque sob alerta" value={formatCurrency(kpis.valorTotal)} accent="red" />
        <GlassKpi label="Sem preço de mercado" value={kpis.semPreco.toString()} accent="red" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar código ou descrição..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>

        {/* Marca multi-select */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 justify-between font-normal min-w-[180px]">
              <span className="truncate">
                {marcaFilter.length === 0
                  ? 'Todas as marcas'
                  : marcaFilter.length === 1
                    ? marcaFilter[0]
                    : `${marcaFilter.length} marcas`}
              </span>
              {marcaFilter.length > 0 ? (
                <X
                  className="h-3.5 w-3.5 opacity-60 hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); setMarcaFilter([]); }}
                />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[260px] p-2" align="start">
            <Input
              placeholder="Buscar marca..."
              value={marcaSearch}
              onChange={e => setMarcaSearch(e.target.value)}
              className="h-8 mb-2"
            />
            <div className="flex items-center justify-between mb-1 px-1">
              <span className="text-xs text-muted-foreground">
                {marcaFilter.length} selecionada{marcaFilter.length === 1 ? '' : 's'}
              </span>
              {marcaFilter.length > 0 && (
                <button onClick={() => setMarcaFilter([])} className="text-xs text-primary hover:underline">
                  Limpar
                </button>
              )}
            </div>
            <div className="max-h-[280px] overflow-y-auto">
              {marcas.filter(m => m.toLowerCase().includes(marcaSearch.toLowerCase())).map(m => {
                const checked = marcaFilter.includes(m);
                return (
                  <button
                    key={m}
                    onClick={() => setMarcaFilter(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted text-left"
                  >
                    <div className={cn('h-4 w-4 rounded border flex items-center justify-center', checked ? 'bg-primary border-primary' : 'border-input')}>
                      {checked && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <span className="truncate">{m}</span>
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        {/* Chip de tipo */}
        <Button
          variant={tipoEstoqueOnly ? 'default' : 'outline'}
          size="sm"
          className="h-9"
          onClick={() => setTipoEstoqueOnly(v => !v)}
        >
          Apenas estoque parado
        </Button>

        {/* Filtro: data da última pesquisa de preço */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 justify-between font-normal min-w-[220px]">
              <span className="flex items-center gap-2 truncate">
                <CalendarIcon className="h-3.5 w-3.5 opacity-70" />
                {desdeData ? `Pesquisado desde ${format(desdeData, 'dd/MM/yyyy')}` : 'Preço pesquisado desde…'}
              </span>
              {desdeData ? (
                <X
                  className="h-3.5 w-3.5 opacity-60 hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); setDesdeData(undefined); }}
                />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={desdeData}
              onSelect={setDesdeData}
              disabled={(date) => date > new Date()}
              initialFocus
              className={cn('p-3 pointer-events-auto')}
            />
          </PopoverContent>
        </Popover>

        {/* Ordenação */}
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="h-9 w-[210px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recente">Mais recentes (última compra)</SelectItem>
            <SelectItem value="antigo">Mais antigos (sem compra)</SelectItem>
            <SelectItem value="valor">Maior valor</SelectItem>
            <SelectItem value="estoque_desc">Maior estoque</SelectItem>
            <SelectItem value="estoque_asc">Menor estoque</SelectItem>
            <SelectItem value="preco_recente">Preço atualizado recente</SelectItem>
            <SelectItem value="preco_antigo">Preço mais desatualizado</SelectItem>
            <SelectItem value="marca">Marca (A-Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 rounded-2xl border border-dashed">
          <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-muted-foreground">Nenhum alerta corresponde aos filtros atuais.</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((a, idx) => (
            <AlertaCard
              key={a.ps.id}
              data={a}
              index={idx}
              onOpen={() => setDrawerProdutoId(a.produto!.id)}
              onUpdatePrice={() => setUpdateTarget({
                codigo: a.produto!.codigo,
                descricao: a.produto!.descricao,
                marca: a.produto!.marca || '',
                precoTabela: a.ps.preco_tabela,
              })}
              diasVerde={config.precoMercado.diasVerde}
              diasVermelho={config.precoMercado.diasVermelho}
            />
          ))}
        </div>
      )}

      <ProductDrawer produtoId={drawerProdutoId} onClose={() => setDrawerProdutoId(null)} />

      {updateTarget && (
        <MarketPriceUpdateDialog
          open={!!updateTarget}
          onOpenChange={(o) => { if (!o) setUpdateTarget(null); }}
          produtoCodigo={updateTarget.codigo}
          produtoDescricao={updateTarget.descricao}
          produtoMarca={updateTarget.marca}
          precoTabela={updateTarget.precoTabela}
          onSaved={(codigo, preco, updatedAt) => {
            setPrecosMap(prev => ({ ...prev, [codigo]: { preco, updated_at: updatedAt } }));
          }}
        />
      )}

      <AlertDialog open={showPdfConfirm} onOpenChange={setShowPdfConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmação de exportação</AlertDialogTitle>
            <AlertDialogDescription>
              O arquivo terá mais de 100 linhas ({filtered.length}). Deseja continuar com a geração?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setShowPdfConfirm(false);
              generatePDF();
            }}>
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------------------------- helpers ---------------------------- */

function GlassKpi({ label, value, accent }: { label: string; value: string; accent: Severity }) {
  const sev = accent === 'red' ? 'sev-red' : accent === 'amber' ? 'sev-amber' : 'sev-green';
  return (
    <div className={cn('glass-card relative overflow-hidden rounded-2xl p-4', sev)}>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1 font-mono">{value}</p>
    </div>
  );
}

function AlertaCard({
  data, index, onOpen, onUpdatePrice, diasVerde, diasVermelho,
}: {
  data: any; index: number; onOpen: () => void; onUpdatePrice: () => void; diasVerde: number; diasVermelho: number;
}) {
  const { ps, produto, severity, precoMercadoDias, precoMercadoValor, regras } = data;

  const sevClass =
    severity === 'red' ? 'sev-red' :
    severity === 'amber' ? 'sev-amber' : 'sev-green';

  let pmBadgeClass = 'bg-muted text-muted-foreground';
  let pmLabel = 'Sem preço';
  if (precoMercadoValor !== null) {
    if (precoMercadoDias <= diasVerde) {
      pmBadgeClass = 'bg-aging-healthy text-aging-healthy';
      pmLabel = `Atualizado há ${precoMercadoDias}d`;
    } else if (precoMercadoDias <= diasVermelho) {
      pmBadgeClass = 'bg-aging-warning text-aging-warning';
      pmLabel = `Há ${precoMercadoDias}d`;
    } else {
      pmBadgeClass = 'bg-aging-critical text-aging-critical';
      pmLabel = `Desatualizado há ${precoMercadoDias}d`;
    }
  }

  const ultCompra = ps.data_ultima_compra ? formatDateBR(ps.data_ultima_compra) : '—';
  const diasCompra = ps.dias_sem_compra >= 0 ? `há ${ps.dias_sem_compra}d` : 'sem registro';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.02, 0.3) }}
      className={cn(
        'glass-card relative overflow-hidden rounded-2xl p-5 pl-6 hover:shadow-xl transition-all cursor-pointer',
        sevClass
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono font-semibold text-foreground">{produto.codigo}</span>
          {produto.marca && (
            <Badge variant="outline" className="text-[10px] py-0 h-5">{produto.marca}</Badge>
          )}
        </div>
        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', pmBadgeClass)}>
          {pmLabel}
        </span>
      </div>

      <h3 className="text-sm font-semibold leading-snug line-clamp-2 mb-3 min-h-[2.5rem]">
        {produto.descricao}
      </h3>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Valor estoque</p>
          <p className="text-base font-bold font-mono">{formatCurrency(ps.valor_total)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Quantidade</p>
          <p className="text-base font-bold font-mono">{ps.quantidade}</p>
        </div>
      </div>

      <div className="text-xs text-muted-foreground mb-3">
        <span className="font-medium text-foreground">Última compra:</span> {ultCompra} · {diasCompra}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {regras.map((r: string) => (
          <Badge key={r} variant="secondary" className="text-[10px] py-0 h-5">{r}</Badge>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" className="h-8" onClick={onOpen}>
          Ver detalhes
        </Button>
        <Button
          variant="default"
          size="sm"
          className="h-8 gap-1.5"
          onClick={(e) => { e.stopPropagation(); onUpdatePrice(); }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar preço
        </Button>
      </div>
    </motion.div>
  );
}
