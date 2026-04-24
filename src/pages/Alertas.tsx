import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Copy, RefreshCw, Search, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useInventory } from '@/store/InventoryContext';
import { useAlertasConfig } from '@/hooks/useAlertasConfig';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, parseLocalDate } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductDrawer } from '@/components/ProductDrawer';
import { MarketPriceUpdateDialog } from '@/components/MarketPriceUpdateDialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type Severity = 'red' | 'amber' | 'green';
type SortKey = 'valor' | 'antigo' | 'marca';

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
  const [sortKey, setSortKey] = useState<SortKey>('valor');
  const [drawerProdutoId, setDrawerProdutoId] = useState<string | null>(null);
  const [updateTarget, setUpdateTarget] = useState<{ codigo: string; descricao: string; marca: string; precoTabela: number } | null>(null);

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
        ps.valor_total >= config.estoqueParado.valorMin
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

      if (regras.length === 0) continue;

      // Card severity = pior caso entre regras disparadas
      const isParadoCritico = ps.dias_sem_compra >= config.estoqueParado.diasMin * 2;
      let severity: Severity = precoSev;
      if (config.estoqueParado.enabled && regras.some(r => r.startsWith('Parado'))) {
        severity = isParadoCritico || precoSev === 'red' ? 'red' : (precoSev === 'amber' ? 'amber' : 'amber');
      }

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
  }, [latestProdSnaps, produtoMap, precosMap, config]);

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

    arr = [...arr].sort((a, b) => {
      if (sortKey === 'valor') return b.ps.valor_total - a.ps.valor_total;
      if (sortKey === 'antigo') return b.ps.dias_sem_compra - a.ps.dias_sem_compra;
      return (a.produto!.marca || '').localeCompare(b.produto!.marca || '');
    });

    return arr;
  }, [alertas, search, marcaFilter, tipoEstoqueOnly, sortKey]);

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
        <Button variant="outline" size="sm" onClick={handleCopy} disabled={filtered.length === 0}>
          <Copy className="h-4 w-4 mr-2" /> Copiar códigos
        </Button>
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

        {/* Ordenação */}
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="valor">Maior valor</SelectItem>
            <SelectItem value="antigo">Mais antigo</SelectItem>
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
  data, index, onOpen, diasVerde, diasVermelho,
}: {
  data: any; index: number; onOpen: () => void; diasVerde: number; diasVermelho: number;
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

      <Button variant="outline" size="sm" className="w-full h-8" onClick={onOpen}>
        Ver detalhes
      </Button>
    </motion.div>
  );
}
