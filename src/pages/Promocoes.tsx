import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useInventory } from '@/store/InventoryContext';
import { formatCurrency, formatNumber, formatDate } from '@/types/inventory';
import { Textarea } from '@/components/ui/textarea';
import { KPICard } from '@/components/KPICard';
import { ProductDrawer } from '@/components/ProductDrawer';
import { Tag, PackageSearch, CalendarIcon, Upload, ArrowUpDown, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

type StatusFilter = 'todos' | 'vendeu' | 'sem-movimento' | 'reposicao';
type PromoFilter = 'todas' | 'ativa' | 'expirada' | 'recem-expirada';
type PromoSortKey = 'codigo' | 'descricao' | 'dataFimPromocao' | 'precoTabela' | 'valorPromocao' | 'percentualDesconto' | 'qtdAnterior' | 'qtdAtual' | 'delta' | 'status' | 'valorEstoque';

interface PromoComparison {
  produtoId: string;
  codigo: string;
  descricao: string;
  dataFimPromocao: string;
  precoTabela: number;
  valorPromocao: number;
  percentualDesconto: number;
  qtdAnterior: number;
  qtdAtual: number;
  delta: number;
  status: 'vendeu' | 'sem-movimento' | 'reposicao';
  promoAtiva: boolean;
  diasSemCompra: number;
}

const FONTES_PRECO = [
  'Mercado Livre',
  'Kabum',
  'Pichau',
  'Amazon',
  'Magazine Luiza',
  'Netshoes',
  'Outro',
] as const;

type FontePreco = typeof FONTES_PRECO[number];

interface PrecoMercado {
  produto_id: string;
  preco: number;
  updated_at: string;
  fonte: string;
}

interface CampanhaProduto {
  id: string;
  produto_id: string;
  campanha: string;
  canal: string;
  data_inicio: string;
  data_fim: string;
}

const CANAIS_CAMPANHA = ['Marketplace', 'Ecommerce', 'Mailing', 'Televendas'] as const;
type CanalCampanha = typeof CANAIS_CAMPANHA[number];

const STATUS_CONFIG = {
  vendeu: { label: 'Vendeu', variant: 'default' as const, className: 'bg-emerald-600 hover:bg-emerald-700' },
  'sem-movimento': { label: 'Sem movimento', variant: 'secondary' as const, className: '' },
  reposicao: { label: 'Reposição', variant: 'outline' as const, className: 'border-amber-500 text-amber-600' },
};

export default function Promocoes() {
  const { snapshots, produtoSnapshots, produtos } = useInventory();

  const sortedSnapshots = useMemo(
    () => [...snapshots].sort((a, b) => new Date(a.data_importacao).getTime() - new Date(b.data_importacao).getTime()),
    [snapshots],
  );

  const [anteriorId, setAnteriorId] = useState<string>('');
  const [atualId, setAtualId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [promoFilter, setPromoFilter] = useState<PromoFilter>('todas');
  const [search, setSearch] = useState('');
  const [grupoFilter, setGrupoFilter] = useState('all');
  const [subgrupoFilter, setSubgrupoFilter] = useState('all');
  const [marcaFilter, setMarcaFilter] = useState('all');
  const [compraFilter, setCompraFilter] = useState('all');
  const [sortKey, setSortKey] = useState<PromoSortKey>('delta');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [drawerProdutoId, setDrawerProdutoId] = useState<string | null>(null);

  // Market price state
  const [precosMercado, setPrecosMercado] = useState<Map<string, PrecoMercado>>(new Map());
  const [mercadoDialogOpen, setMercadoDialogOpen] = useState(false);
  const [mercadoProdutoId, setMercadoProdutoId] = useState<string | null>(null);
  const [mercadoPrecoInput, setMercadoPrecoInput] = useState('');
  const [mercadoSaving, setMercadoSaving] = useState(false);
  const [mercadoFonte, setMercadoFonte] = useState<FontePreco>('Outro');

  // Campaign state
  const [campanhas, setCampanhas] = useState<Map<string, CampanhaProduto>>(new Map());
  const [campanhaDialogOpen, setCampanhaDialogOpen] = useState(false);
  const [campanhaProdutoId, setCampanhaProdutoId] = useState<string | null>(null);
  const [campanhaNome, setCampanhaNome] = useState('');
  const [campanhaCanais, setCampanhaCanais] = useState<CanalCampanha[]>([]);
  const [campanhaDataInicio, setCampanhaDataInicio] = useState<Date | undefined>();
  const [campanhaDataFim, setCampanhaDataFim] = useState<Date | undefined>();
  const [campanhaSaving, setCampanhaSaving] = useState(false);

  // Bulk campaign state
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkCampanhaNome, setBulkCampanhaNome] = useState('');
  const [bulkCanais, setBulkCanais] = useState<CanalCampanha[]>([]);
  const [bulkDataInicio, setBulkDataInicio] = useState<Date | undefined>();
  const [bulkDataFim, setBulkDataFim] = useState<Date | undefined>();
  const [bulkCodigos, setBulkCodigos] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  // Load market prices and campaigns
  useEffect(() => {
    const loadPrecos = async () => {
      const { data, error } = await supabase
        .from('precos_mercado')
        .select('produto_id, preco, updated_at, fonte');
      if (!error && data) {
        const map = new Map<string, PrecoMercado>();
        data.forEach((d: any) => map.set(d.produto_id, d));
        setPrecosMercado(map);
      }
    };
    const loadCampanhas = async () => {
      const { data, error } = await supabase
        .from('campanhas_produto')
        .select('*') as { data: CampanhaProduto[] | null; error: any };
      if (!error && data) {
        const map = new Map<string, CampanhaProduto>();
        data.forEach((d) => map.set(d.produto_id, d));
        setCampanhas(map);
      }
    };
    loadPrecos();
    loadCampanhas();
  }, []);

  // Auto-select last two snapshots
  useMemo(() => {
    if (sortedSnapshots.length >= 2 && !anteriorId && !atualId) {
      setAnteriorId(sortedSnapshots[sortedSnapshots.length - 2].id);
      setAtualId(sortedSnapshots[sortedSnapshots.length - 1].id);
    } else if (sortedSnapshots.length === 1 && !atualId) {
      setAtualId(sortedSnapshots[0].id);
    }
  }, [sortedSnapshots]);

  const comparisons = useMemo<PromoComparison[]>(() => {
    if (!atualId) return [];

    const atualItems = produtoSnapshots.filter(ps => ps.snapshot_id === atualId);
    const anteriorItems = anteriorId
      ? produtoSnapshots.filter(ps => ps.snapshot_id === anteriorId)
      : [];

    const anteriorMap = new Map(anteriorItems.map(i => [i.produto_id, i]));
    const produtoMap = new Map(produtos.map(p => [p.id, p]));
    const now = new Date();

    const results: PromoComparison[] = [];

    for (const item of atualItems) {
      const produto = produtoMap.get(item.produto_id);
      if (!produto) continue;

      const anterior = anteriorMap.get(item.produto_id);
      const qtdAnterior = anterior?.quantidade ?? item.quantidade;
      const qtdAtual = item.quantidade;
      const delta = qtdAnterior - qtdAtual;
      
      const hasPromo = !!item.data_fim_promocao;
      const promoDate = hasPromo ? new Date(item.data_fim_promocao + 'T23:59:59') : null;

      let status: PromoComparison['status'];
      if (delta > 0) status = 'vendeu';
      else if (delta < 0) status = 'reposicao';
      else status = 'sem-movimento';

      results.push({
        produtoId: item.produto_id,
        codigo: produto.codigo,
        descricao: produto.descricao,
        dataFimPromocao: item.data_fim_promocao ?? '',
        precoTabela: item.preco_tabela,
        valorPromocao: item.valor_promocao ?? item.preco_tabela,
        percentualDesconto: item.percentual_desconto ?? 0,
        qtdAnterior,
        qtdAtual,
        delta,
        status,
        promoAtiva: promoDate ? promoDate >= now : false,
        diasSemCompra: item.dias_sem_compra,
      });
    }

    return results.sort((a, b) => b.delta - a.delta);
  }, [atualId, anteriorId, produtoSnapshots, produtos]);

  const produtoMap = useMemo(() => new Map(produtos.map(p => [p.id, p])), [produtos]);

  const grupos = useMemo(() => [...new Set(comparisons.map(c => {
    const p = produtoMap.get(c.produtoId);
    return p?.grupo;
  }).filter(Boolean))].sort() as string[], [comparisons, produtoMap]);

  const subgrupos = useMemo(() => [...new Set(comparisons.map(c => {
    const p = produtoMap.get(c.produtoId);
    return p?.subgrupo;
  }).filter(Boolean))].sort() as string[], [comparisons, produtoMap]);

  const marcas = useMemo(() => [...new Set(comparisons.map(c => {
    const p = produtoMap.get(c.produtoId);
    return p?.marca;
  }).filter(Boolean))].sort() as string[], [comparisons, produtoMap]);

  const filtered = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    let result = comparisons.filter(c => {
      if (search) {
        const q = search.toLowerCase();
        if (!c.codigo.toLowerCase().includes(q) && !c.descricao.toLowerCase().includes(q)) return false;
      }
      const produto = produtoMap.get(c.produtoId);
      if (grupoFilter !== 'all' && produto?.grupo !== grupoFilter) return false;
      if (subgrupoFilter !== 'all' && produto?.subgrupo !== subgrupoFilter) return false;
      if (marcaFilter !== 'all' && produto?.marca !== marcaFilter) return false;
      if (compraFilter === 'lt90') { if (c.diasSemCompra < 0 || c.diasSemCompra >= 90) return false; }
      else if (compraFilter === '90-180') { if (c.diasSemCompra < 90 || c.diasSemCompra > 180) return false; }
      else if (compraFilter === 'gt180') { if (c.diasSemCompra <= 180) return false; }
      else if (compraFilter === 'sem-registro') { if (c.diasSemCompra >= 0) return false; }
      if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
      if (promoFilter === 'ativa' && !c.promoAtiva) return false;
      if (promoFilter === 'expirada') {
        if (!c.dataFimPromocao || c.promoAtiva) return false;
      }
      if (promoFilter === 'recem-expirada') {
        if (!c.dataFimPromocao) return false;
        const promoDate = new Date(c.dataFimPromocao + 'T23:59:59');
        if (c.promoAtiva || promoDate < thirtyDaysAgo) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      let va: any, vb: any;
      if (sortKey === 'codigo' || sortKey === 'descricao' || sortKey === 'status') {
        va = a[sortKey] || '';
        vb = b[sortKey] || '';
      } else if (sortKey === 'dataFimPromocao') {
        va = a.dataFimPromocao || '';
        vb = b.dataFimPromocao || '';
      } else {
        va = a[sortKey] ?? 0;
        vb = b[sortKey] ?? 0;
      }
      if (typeof va === 'string') {
        const cmp = va.localeCompare(vb as string);
        return sortDir === 'desc' ? -cmp : cmp;
      }
      return sortDir === 'desc' ? (vb as number) - (va as number) : (va as number) - (vb as number);
    });

    return result;
  }, [comparisons, search, grupoFilter, subgrupoFilter, marcaFilter, compraFilter, statusFilter, promoFilter, sortKey, sortDir, produtoMap]);

  const kpis = useMemo(() => {
    const total = comparisons.length;
    const venderam = comparisons.filter(c => c.status === 'vendeu').length;
    const semMov = comparisons.filter(c => c.status === 'sem-movimento').length;
    const valorPromo = comparisons.reduce((sum, c) => sum + c.valorPromocao * c.qtdAtual, 0);
    const unidadesVendidas = comparisons.filter(c => c.delta > 0).reduce((sum, c) => sum + c.delta, 0);
    return { total, venderam, semMov, valorPromo, unidadesVendidas };
  }, [comparisons]);

  const handleOpenMercado = (e: React.MouseEvent, codigo: string) => {
    e.stopPropagation();
    setMercadoProdutoId(codigo);
    const existing = precosMercado.get(codigo);
    setMercadoPrecoInput(existing ? String(existing.preco) : '');
    setMercadoFonte((existing?.fonte as FontePreco) || 'Outro');
    setMercadoDialogOpen(true);
  };

  const handleSaveMercado = async () => {
    if (!mercadoProdutoId || !mercadoPrecoInput) return;
    const preco = parseFloat(mercadoPrecoInput.replace(',', '.'));
    if (isNaN(preco) || preco <= 0) {
      toast.error('Informe um preço válido');
      return;
    }

    setMercadoSaving(true);
    const now = new Date().toISOString();
    const { data: inserted, error } = await supabase
      .from('precos_mercado')
      .insert({ produto_id: mercadoProdutoId, preco, updated_at: now, fonte: mercadoFonte } as any)
      .select()
      .single();

    if (error) {
      toast.error('Erro ao salvar preço de mercado');
    } else {
      setPrecosMercado(prev => {
        const next = new Map(prev);
        next.set(mercadoProdutoId, inserted as any);
        return next;
      });
      toast.success('Preço de mercado salvo!');
      setMercadoDialogOpen(false);
    }
    setMercadoSaving(false);
  };

  const handleOpenCampanha = (e: React.MouseEvent, codigo: string) => {
    e.stopPropagation();
    setCampanhaProdutoId(codigo);
    const existing = campanhas.get(codigo);
    setCampanhaNome(existing?.campanha || '');
    setCampanhaCanais(existing?.canal ? (existing.canal as string).split(', ').filter(c => CANAIS_CAMPANHA.includes(c as CanalCampanha)) as CanalCampanha[] : []);
    setCampanhaDataInicio(existing?.data_inicio ? new Date(existing.data_inicio + 'T00:00:00') : undefined);
    setCampanhaDataFim(existing?.data_fim ? new Date(existing.data_fim + 'T00:00:00') : undefined);
    setCampanhaDialogOpen(true);
  };

  const handleSaveCampanha = async () => {
    if (!campanhaProdutoId || !campanhaNome || campanhaCanais.length === 0 || !campanhaDataInicio || !campanhaDataFim) {
      toast.error('Preencha todos os campos');
      return;
    }
    setCampanhaSaving(true);
    const payload = {
      produto_id: campanhaProdutoId,
      campanha: campanhaNome,
      canal: campanhaCanais.join(', '),
      data_inicio: format(campanhaDataInicio, 'yyyy-MM-dd'),
      data_fim: format(campanhaDataFim, 'yyyy-MM-dd'),
    };

    const { data: inserted, error } = await supabase
      .from('campanhas_produto')
      .insert(payload as any)
      .select()
      .single();

    if (error) {
      toast.error('Erro ao salvar campanha');
    } else {
      setCampanhas(prev => {
        const next = new Map(prev);
        next.set(campanhaProdutoId, inserted as CampanhaProduto);
        return next;
      });
      toast.success('Campanha salva!');
      setCampanhaDialogOpen(false);
    }
    setCampanhaSaving(false);
  };

  const mercadoProduto = mercadoProdutoId
    ? comparisons.find(c => c.codigo === mercadoProdutoId)
    : null;
  const mercadoExisting = mercadoProdutoId ? precosMercado.get(mercadoProdutoId) : null;
  const handleSaveBulkCampanha = async () => {
    if (!bulkCampanhaNome || bulkCanais.length === 0 || !bulkDataInicio || !bulkDataFim || !bulkCodigos.trim()) {
      toast.error('Preencha todos os campos');
      return;
    }
    setBulkSaving(true);

    const codigos = bulkCodigos
      .split(/[,;\n]+/)
      .map(c => c.trim())
      .filter(Boolean);

    // Lookup produto_ids by codigo
    const { data: produtosFound, error: lookupError } = await supabase
      .from('produtos')
      .select('id, codigo')
      .in('codigo', codigos);

    if (lookupError) {
      toast.error('Erro ao buscar produtos');
      setBulkSaving(false);
      return;
    }

    const foundCodigos = new Set((produtosFound || []).map(p => p.codigo));
    const notFound = codigos.filter(c => !foundCodigos.has(c));

    if (!produtosFound || produtosFound.length === 0) {
      toast.error('Nenhum código de produto encontrado');
      setBulkSaving(false);
      return;
    }

    const canal = bulkCanais.join(', ');
    const dataInicio = format(bulkDataInicio, 'yyyy-MM-dd');
    const dataFim = format(bulkDataFim, 'yyyy-MM-dd');

    const rows = produtosFound.map(p => ({
      produto_id: p.codigo,
      campanha: bulkCampanhaNome,
      canal,
      data_inicio: dataInicio,
      data_fim: dataFim,
    }));

    const { error: insertError } = await supabase
      .from('campanhas_produto')
      .insert(rows as any);

    if (insertError) {
      toast.error('Erro ao salvar campanhas');
    } else {
      // Update local state
      setCampanhas(prev => {
        const next = new Map(prev);
        rows.forEach(r => {
          next.set(r.produto_id, { id: '', ...r } as CampanhaProduto);
        });
        return next;
      });
      const msg = notFound.length > 0
        ? `${produtosFound.length} produtos vinculados. ${notFound.length} código(s) não encontrado(s): ${notFound.join(', ')}`
        : `${produtosFound.length} produtos vinculados à campanha!`;
      toast.success(msg);
      setBulkDialogOpen(false);
      setBulkCampanhaNome('');
      setBulkCanais([]);
      setBulkDataInicio(undefined);
      setBulkDataFim(undefined);
      setBulkCodigos('');
    }
    setBulkSaving(false);
  };

  const campanhaProduto = campanhaProdutoId
    ? comparisons.find(c => c.codigo === campanhaProdutoId)
    : null;

  const toggleSort = (key: PromoSortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
    setPage(0);
  };

  // Pagination
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedItems = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);

  useEffect(() => { setPage(0); }, [statusFilter, promoFilter, search, grupoFilter, subgrupoFilter, marcaFilter, compraFilter, atualId, anteriorId]);

  if (sortedSnapshots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground gap-3">
        <Tag className="h-12 w-12" />
        <p className="text-lg font-medium">Nenhuma importação encontrada</p>
        <p className="text-sm">Importe pelo menos um relatório para analisar promoções.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Análise de Promoções</h1>

      {/* Snapshot selectors */}
      <div className="flex flex-wrap gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Snapshot Anterior</label>
          <Select value={anteriorId} onValueChange={setAnteriorId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Selecionar..." />
            </SelectTrigger>
            <SelectContent>
              {sortedSnapshots.map(s => (
                <SelectItem key={s.id} value={s.id} disabled={s.id === atualId}>
                  {formatDate(s.data_importacao)} — {s.nome_arquivo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Snapshot Atual</label>
          <Select value={atualId} onValueChange={setAtualId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Selecionar..." />
            </SelectTrigger>
            <SelectContent>
              {sortedSnapshots.map(s => (
                <SelectItem key={s.id} value={s.id} disabled={s.id === anteriorId}>
                  {formatDate(s.data_importacao)} — {s.nome_arquivo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard
          title="Itens em Promoção"
          value={formatNumber(kpis.total)}
          subtitle={`${kpis.venderam} venderam`}
          onClick={() => setPromoFilter(prev => prev === 'ativa' ? 'todas' : 'ativa')}
          active={promoFilter === 'ativa'}
        />
        <KPICard
          title="Taxa de Conversão"
          value={kpis.total > 0 ? `${((kpis.venderam / kpis.total) * 100).toFixed(1)}%` : '—'}
          subtitle={`${kpis.semMov} sem movimento`}
        />
        <KPICard title="Unidades Vendidas" value={formatNumber(kpis.unidadesVendidas)} subtitle="em itens promocionais" />
        <KPICard title="Valor em Promoção" value={formatCurrency(kpis.valorPromo)} subtitle="estoque atual" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código ou descrição..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={grupoFilter} onValueChange={v => { setGrupoFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Grupo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os grupos</SelectItem>
            {grupos.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={subgrupoFilter} onValueChange={v => { setSubgrupoFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Subgrupo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos subgrupos</SelectItem>
            {subgrupos.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={marcaFilter} onValueChange={v => { setMarcaFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Marca" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as marcas</SelectItem>
            {marcas.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="vendeu">Vendeu</SelectItem>
            <SelectItem value="sem-movimento">Sem movimento</SelectItem>
            <SelectItem value="reposicao">Reposição</SelectItem>
          </SelectContent>
        </Select>
        <Select value={promoFilter} onValueChange={v => setPromoFilter(v as PromoFilter)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas promoções</SelectItem>
            <SelectItem value="ativa">Promoção ativa</SelectItem>
            <SelectItem value="recem-expirada">Recém expirada (30 dias)</SelectItem>
            <SelectItem value="expirada">Promoção expirada</SelectItem>
          </SelectContent>
        </Select>
        <Select value={compraFilter} onValueChange={v => { setCompraFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Últ. Compra" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas (compra)</SelectItem>
            <SelectItem value="lt90">&lt; 90 dias</SelectItem>
            <SelectItem value="90-180">90 a 180 dias</SelectItem>
            <SelectItem value="gt180">&gt; 180 dias</SelectItem>
            <SelectItem value="sem-registro">Sem registro</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setBulkDialogOpen(true)} className="ml-auto">
          <Upload className="h-4 w-4 mr-1.5" />
          Subir Campanha
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{formatNumber(filtered.length)} produtos</p>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Detalhamento por Produto</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <PackageSearch className="h-8 w-8" />
              <p className="text-sm">Nenhum item promocional encontrado para os filtros selecionados.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-2 cursor-pointer select-none" onClick={() => toggleSort('codigo')}>
                    <span className="inline-flex items-center gap-1">Código <ArrowUpDown className="h-3 w-3" /></span>
                  </TableHead>
                  <TableHead className="px-2 cursor-pointer select-none" onClick={() => toggleSort('descricao')}>
                    <span className="inline-flex items-center gap-1">Descrição <ArrowUpDown className="h-3 w-3" /></span>
                  </TableHead>
                  <TableHead className="px-2 text-center cursor-pointer select-none" onClick={() => toggleSort('dataFimPromocao')}>
                    <span className="inline-flex items-center gap-1">Validade Promo <ArrowUpDown className="h-3 w-3" /></span>
                  </TableHead>
                  <TableHead className="px-2 text-right cursor-pointer select-none" onClick={() => toggleSort('precoTabela')}>
                    <span className="inline-flex items-center gap-1 justify-end">Preço Tabela <ArrowUpDown className="h-3 w-3" /></span>
                  </TableHead>
                  <TableHead className="px-2 text-right cursor-pointer select-none" onClick={() => toggleSort('valorPromocao')}>
                    <span className="inline-flex items-center gap-1 justify-end">Preço Promo <ArrowUpDown className="h-3 w-3" /></span>
                  </TableHead>
                  <TableHead className="px-2 text-center cursor-pointer select-none" onClick={() => toggleSort('percentualDesconto')}>
                    <span className="inline-flex items-center gap-1">Desconto <ArrowUpDown className="h-3 w-3" /></span>
                  </TableHead>
                  <TableHead className="px-2 text-right cursor-pointer select-none" onClick={() => toggleSort('qtdAnterior')}>
                    <span className="inline-flex items-center gap-1 justify-end">Qtd Anterior <ArrowUpDown className="h-3 w-3" /></span>
                  </TableHead>
                  <TableHead className="px-2 text-right cursor-pointer select-none" onClick={() => toggleSort('qtdAtual')}>
                    <span className="inline-flex items-center gap-1 justify-end">Qtd Atual <ArrowUpDown className="h-3 w-3" /></span>
                  </TableHead>
                  <TableHead className="px-2 text-right cursor-pointer select-none" onClick={() => toggleSort('delta')}>
                    <span className="inline-flex items-center gap-1 justify-end">Diferença <ArrowUpDown className="h-3 w-3" /></span>
                  </TableHead>
                  <TableHead className="px-2 text-center cursor-pointer select-none" onClick={() => toggleSort('status')}>
                    <span className="inline-flex items-center gap-1">Status <ArrowUpDown className="h-3 w-3" /></span>
                  </TableHead>
                  <TableHead className="px-2 text-center">Mercado</TableHead>
                  <TableHead className="px-2 text-center">Campanha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map(item => {
                  const cfg = STATUS_CONFIG[item.status];
                  const hasMercado = precosMercado.has(item.codigo);
                  const mercadoEntry = precosMercado.get(item.codigo);
                  const precoDesatualizado = item.promoAtiva && mercadoEntry &&
                    (Date.now() - new Date(mercadoEntry.updated_at).getTime()) > 25 * 24 * 60 * 60 * 1000;
                  const camp = campanhas.get(item.codigo);
                  const hasCampanhaVencida = camp ? new Date(camp.data_fim + 'T23:59:59') < new Date() : false;
                  return (
                    <TableRow
                      key={item.produtoId}
                      className={`cursor-pointer ${hasCampanhaVencida ? 'bg-purple-200 dark:bg-purple-900/40' : item.promoAtiva ? 'bg-orange-50 dark:bg-orange-950/20' : ''}`}
                      onClick={() => setDrawerProdutoId(item.produtoId)}
                    >
                      <TableCell className="px-2 py-1.5 font-mono text-sm">{item.codigo}</TableCell>
                      <TableCell className="px-2 py-1.5 max-w-[250px] truncate">
                        <span className="flex items-center gap-1.5">
                          {item.descricao}
                          {precoDesatualizado && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-600 dark:text-amber-400 whitespace-nowrap">
                              ⚠ Preço desatualizado
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-center">
                        <span className={item.promoAtiva ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}>
                          {formatDate(item.dataFimPromocao)}
                        </span>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(item.precoTabela)}</TableCell>
                      <TableCell className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(item.valorPromocao)}</TableCell>
                      <TableCell className="px-2 py-1.5 text-center">
                        {item.percentualDesconto > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            -{item.percentualDesconto.toFixed(0)}%
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-right tabular-nums">{formatNumber(item.qtdAnterior)}</TableCell>
                      <TableCell className={`px-2 py-1.5 text-right tabular-nums font-medium ${item.qtdAtual >= 100 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                        {formatNumber(item.qtdAtual)}
                        {item.qtdAtual >= 100 && <span className="ml-1">🔥</span>}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-right tabular-nums font-medium">
                        <span className={item.delta > 0 ? 'text-emerald-600' : item.delta < 0 ? 'text-amber-600' : 'text-muted-foreground'}>
                          {item.delta > 0 ? `+${formatNumber(item.delta)}` : formatNumber(item.delta)}
                        </span>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-center">
                        <Badge variant={cfg.variant} className={cfg.className}>
                          {cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`text-xs px-2 py-1 h-auto ${hasMercado ? 'text-red-600 hover:text-red-700' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={(e) => handleOpenMercado(e, item.codigo)}
                          >
                            💲 Mercado
                          </Button>
                          {mercadoEntry && (() => {
                            const diff = ((item.valorPromocao - mercadoEntry.preco) / mercadoEntry.preco) * 100;
                            const isAbove = diff > 0;
                            const absVal = Math.abs(diff).toFixed(0);
                            const updDate = new Date(mercadoEntry.updated_at).toLocaleDateString('pt-BR');
                            return (
                              <span className="flex flex-col items-center leading-tight">
                                <span className={`text-xs font-semibold whitespace-nowrap ${isAbove ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                  {isAbove ? `▲ +${absVal}%` : `▼ -${absVal}%`}
                                </span>
                                <span className="text-[9px] text-muted-foreground whitespace-nowrap">{updDate}</span>
                              </span>
                            );
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-center">
                        {(() => {
                          const camp = campanhas.get(item.codigo);
                          let colorClass = 'text-muted-foreground hover:text-foreground';
                          if (camp) {
                            const hoje = new Date();
                            const inicio = new Date(camp.data_inicio + 'T00:00:00');
                            const fim = new Date(camp.data_fim + 'T23:59:59');
                            if (inicio > hoje) colorClass = 'text-blue-600 hover:text-blue-700';
                            else if (fim >= hoje) colorClass = 'text-red-600 hover:text-red-700';
                            else colorClass = 'text-muted-foreground hover:text-foreground';
                          }
                          return (
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`text-xs px-2 py-1 h-auto ${colorClass}`}
                              onClick={(e) => handleOpenCampanha(e, item.codigo)}
                            >
                              🏷️
                              <span className="ml-0.5">Campanha</span>
                            </Button>
                          );
                        })()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <p className="text-xs text-muted-foreground">
                Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
              </p>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Próximo</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Product Drawer */}
      <ProductDrawer produtoId={drawerProdutoId} onClose={() => setDrawerProdutoId(null)} />

      {/* Market Price Dialog */}
      {mercadoDialogOpen && (
      <Dialog open={mercadoDialogOpen} onOpenChange={setMercadoDialogOpen}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>💲 Preço de Mercado</DialogTitle>
          </DialogHeader>
          {mercadoProduto && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">{mercadoProduto.descricao}</p>
                <p className="text-xs text-muted-foreground font-mono">{mercadoProduto.codigo}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Preço Tabela</p>
                  <p className="font-mono font-semibold">{formatCurrency(mercadoProduto.precoTabela)}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Preço Promo</p>
                  <p className="font-mono font-semibold">{formatCurrency(mercadoProduto.valorPromocao)}</p>
                </div>
              </div>

              {mercadoExisting && (
                <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3 border border-red-200 dark:border-red-800">
                  <p className="text-[10px] uppercase text-red-600 dark:text-red-400">Preço de mercado atual</p>
                  <p className="font-mono font-semibold text-red-700 dark:text-red-300">{formatCurrency(mercadoExisting.preco)}</p>
                  <p className="text-[10px] text-red-500 mt-1">
                    Fonte: {mercadoExisting.fonte || 'Outro'} · Atualizado em {new Date(mercadoExisting.updated_at).toLocaleDateString('pt-BR')} às {new Date(mercadoExisting.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Fonte do preço</label>
                <Select value={mercadoFonte} onValueChange={v => setMercadoFonte(v as FontePreco)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONTES_PRECO.map(f => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Novo preço de mercado (R$)</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex: 29.90"
                  value={mercadoPrecoInput}
                  onChange={(e) => setMercadoPrecoInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveMercado()}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMercadoDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveMercado} disabled={mercadoSaving}>
              {mercadoSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}

      {/* Campaign Dialog */}
      {campanhaDialogOpen && (
      <Dialog open={campanhaDialogOpen} onOpenChange={setCampanhaDialogOpen}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>🏷️ Campanha Promocional</DialogTitle>
          </DialogHeader>
          {campanhaProduto && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">{campanhaProduto.descricao}</p>
                <p className="text-xs text-muted-foreground font-mono">{campanhaProduto.codigo}</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Nome da campanha</label>
                <Input
                  placeholder="Ex: Black Friday 2026"
                  value={campanhaNome}
                  onChange={(e) => setCampanhaNome(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Canais</label>
                <div className="flex flex-wrap gap-2">
                  {CANAIS_CAMPANHA.map(c => (
                    <label key={c} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <Checkbox
                        checked={campanhaCanais.includes(c)}
                        onCheckedChange={(checked) => {
                          setCampanhaCanais(prev =>
                            checked ? [...prev, c] : prev.filter(x => x !== c)
                          );
                        }}
                      />
                      {c}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Data Início</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !campanhaDataInicio && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {campanhaDataInicio ? format(campanhaDataInicio, 'dd/MM/yyyy') : 'Selecionar'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={campanhaDataInicio} onSelect={setCampanhaDataInicio} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Data Fim</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !campanhaDataFim && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {campanhaDataFim ? format(campanhaDataFim, 'dd/MM/yyyy') : 'Selecionar'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={campanhaDataFim} onSelect={setCampanhaDataFim} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {campanhas.get(campanhaProdutoId || '') && (
                <div className="bg-muted/50 rounded-lg p-3 border">
                  <p className="text-[10px] uppercase text-muted-foreground">Campanha atual</p>
                  <p className="text-sm font-medium">{campanhas.get(campanhaProdutoId || '')?.campanha}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {campanhas.get(campanhaProdutoId || '')?.canal} · {campanhas.get(campanhaProdutoId || '')?.data_inicio && new Date(campanhas.get(campanhaProdutoId || '')!.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR')} a {campanhas.get(campanhaProdutoId || '')?.data_fim && new Date(campanhas.get(campanhaProdutoId || '')!.data_fim + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCampanhaDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveCampanha} disabled={campanhaSaving}>
              {campanhaSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}
      {/* Bulk Campaign Dialog */}
      {bulkDialogOpen && (
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>📦 Subir Campanha em Lote</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nome da campanha</label>
              <Input
                placeholder="Ex: Black Friday 2026"
                value={bulkCampanhaNome}
                onChange={(e) => setBulkCampanhaNome(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Canais</label>
              <div className="flex flex-wrap gap-2">
                {CANAIS_CAMPANHA.map(c => (
                  <label key={c} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox
                      checked={bulkCanais.includes(c)}
                      onCheckedChange={(checked) => {
                        setBulkCanais(prev =>
                          checked ? [...prev, c] : prev.filter(x => x !== c)
                        );
                      }}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Data Início</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !bulkDataInicio && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {bulkDataInicio ? format(bulkDataInicio, 'dd/MM/yyyy') : 'Selecionar'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={bulkDataInicio} onSelect={setBulkDataInicio} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Data Fim</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !bulkDataFim && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {bulkDataFim ? format(bulkDataFim, 'dd/MM/yyyy') : 'Selecionar'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={bulkDataFim} onSelect={setBulkDataFim} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Códigos dos produtos</label>
              <Textarea
                placeholder="Insira os códigos separados por vírgula, ponto e vírgula ou quebra de linha. Ex:&#10;ABC123&#10;DEF456, GHI789"
                value={bulkCodigos}
                onChange={(e) => setBulkCodigos(e.target.value)}
                rows={6}
              />
              <p className="text-[10px] text-muted-foreground">Aceita separação por vírgula, ponto e vírgula ou quebra de linha</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveBulkCampanha} disabled={bulkSaving}>
              {bulkSaving ? 'Salvando...' : 'Salvar Campanha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}
    </div>
  );
}
