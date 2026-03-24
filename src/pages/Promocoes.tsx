import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useInventory } from '@/store/InventoryContext';
import { formatCurrency, formatNumber, formatDate } from '@/types/inventory';
import { KPICard } from '@/components/KPICard';
import { ProductDrawer } from '@/components/ProductDrawer';
import { Tag, PackageSearch, CalendarIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

type StatusFilter = 'todos' | 'vendeu' | 'sem-movimento' | 'reposicao';
type PromoFilter = 'todas' | 'ativa' | 'expirada' | 'recem-expirada';

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
  const [campanhaCanal, setCampanhaCanal] = useState<CanalCampanha>('Marketplace');
  const [campanhaDataInicio, setCampanhaDataInicio] = useState<Date | undefined>();
  const [campanhaDataFim, setCampanhaDataFim] = useState<Date | undefined>();
  const [campanhaSaving, setCampanhaSaving] = useState(false);

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
      if (!item.data_fim_promocao) continue;

      const produto = produtoMap.get(item.produto_id);
      if (!produto) continue;

      const anterior = anteriorMap.get(item.produto_id);
      const qtdAnterior = anterior?.quantidade ?? item.quantidade;
      const qtdAtual = item.quantidade;
      const delta = qtdAnterior - qtdAtual;
      const promoDate = new Date(item.data_fim_promocao + 'T23:59:59');

      let status: PromoComparison['status'];
      if (delta > 0) status = 'vendeu';
      else if (delta < 0) status = 'reposicao';
      else status = 'sem-movimento';

      results.push({
        produtoId: item.produto_id,
        codigo: produto.codigo,
        descricao: produto.descricao,
        dataFimPromocao: item.data_fim_promocao,
        precoTabela: item.preco_tabela,
        valorPromocao: item.valor_promocao ?? item.preco_tabela,
        percentualDesconto: item.percentual_desconto ?? 0,
        qtdAnterior,
        qtdAtual,
        delta,
        status,
        promoAtiva: promoDate >= now,
      });
    }

    return results.sort((a, b) => b.delta - a.delta);
  }, [atualId, anteriorId, produtoSnapshots, produtos]);

  const filtered = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    return comparisons.filter(c => {
      if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
      if (promoFilter === 'ativa' && !c.promoAtiva) return false;
      if (promoFilter === 'expirada' && c.promoAtiva) return false;
      if (promoFilter === 'recem-expirada') {
        const promoDate = new Date(c.dataFimPromocao + 'T23:59:59');
        if (c.promoAtiva || promoDate < thirtyDaysAgo) return false;
      }
      return true;
    });
  }, [comparisons, statusFilter, promoFilter]);

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
    const { error } = await supabase
      .from('precos_mercado')
      .upsert(
        { produto_id: mercadoProdutoId, preco, updated_at: now, fonte: mercadoFonte } as any,
        { onConflict: 'produto_id' }
      );

    if (error) {
      toast.error('Erro ao salvar preço de mercado');
    } else {
      setPrecosMercado(prev => {
        const next = new Map(prev);
        next.set(mercadoProdutoId, { produto_id: mercadoProdutoId, preco, updated_at: now, fonte: mercadoFonte });
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
    setCampanhaCanal((existing?.canal as CanalCampanha) || 'Marketplace');
    setCampanhaDataInicio(existing?.data_inicio ? new Date(existing.data_inicio + 'T00:00:00') : undefined);
    setCampanhaDataFim(existing?.data_fim ? new Date(existing.data_fim + 'T00:00:00') : undefined);
    setCampanhaDialogOpen(true);
  };

  const handleSaveCampanha = async () => {
    if (!campanhaProdutoId || !campanhaNome || !campanhaDataInicio || !campanhaDataFim) {
      toast.error('Preencha todos os campos');
      return;
    }
    setCampanhaSaving(true);
    const payload = {
      produto_id: campanhaProdutoId,
      campanha: campanhaNome,
      canal: campanhaCanal,
      data_inicio: format(campanhaDataInicio, 'yyyy-MM-dd'),
      data_fim: format(campanhaDataFim, 'yyyy-MM-dd'),
    };

    const existing = campanhas.get(campanhaProdutoId);
    let error;
    if (existing) {
      ({ error } = await supabase.from('campanhas_produto').update(payload as any).eq('id', existing.id));
    } else {
      ({ error } = await supabase.from('campanhas_produto').insert(payload as any));
    }

    if (error) {
      toast.error('Erro ao salvar campanha');
    } else {
      setCampanhas(prev => {
        const next = new Map(prev);
        next.set(campanhaProdutoId, { id: existing?.id || '', ...payload } as CampanhaProduto);
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
  const campanhaProduto = campanhaProdutoId
    ? comparisons.find(c => c.codigo === campanhaProdutoId)
    : null;

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
      <div className="flex flex-wrap gap-3">
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
      </div>

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
                  <TableHead className="px-2">Código</TableHead>
                  <TableHead className="px-2">Descrição</TableHead>
                  <TableHead className="px-2 text-center">Validade Promo</TableHead>
                  <TableHead className="px-2 text-right">Preço Tabela</TableHead>
                  <TableHead className="px-2 text-right">Preço Promo</TableHead>
                  <TableHead className="px-2 text-center">Desconto</TableHead>
                  <TableHead className="px-2 text-right">Qtd Anterior</TableHead>
                  <TableHead className="px-2 text-right">Qtd Atual</TableHead>
                  <TableHead className="px-2 text-right">Diferença</TableHead>
                  <TableHead className="px-2 text-center">Status</TableHead>
                  <TableHead className="px-2 text-center">Mercado</TableHead>
                  <TableHead className="px-2 text-center">Campanha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(item => {
                  const cfg = STATUS_CONFIG[item.status];
                  const hasMercado = precosMercado.has(item.codigo);
                  const mercadoEntry = precosMercado.get(item.codigo);
                  const precoDesatualizado = item.promoAtiva && mercadoEntry &&
                    (Date.now() - new Date(mercadoEntry.updated_at).getTime()) > 25 * 24 * 60 * 60 * 1000;
                  return (
                    <TableRow
                      key={item.produtoId}
                      className={`cursor-pointer ${item.promoAtiva ? 'bg-orange-50 dark:bg-orange-950/20' : ''}`}
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
                        <div className="flex items-center justify-center gap-1.5">
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
                            return (
                              <span className={`text-xs font-semibold whitespace-nowrap ${isAbove ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                {isAbove ? `▲ +${absVal}%` : `▼ -${absVal}%`}
                              </span>
                            );
                          })()}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Product Drawer */}
      <ProductDrawer produtoId={drawerProdutoId} onClose={() => setDrawerProdutoId(null)} />

      {/* Market Price Dialog */}
      <Dialog open={mercadoDialogOpen} onOpenChange={(open) => { if (!open) return; setMercadoDialogOpen(open); }}>
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
    </div>
  );
}
