import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useInventory } from '@/store/InventoryContext';
import { formatCurrency, formatNumber, formatDate } from '@/types/inventory';
import { KPICard } from '@/components/KPICard';
import { Tag, TrendingDown, Minus, ArrowUpRight, PackageSearch } from 'lucide-react';

type StatusFilter = 'todos' | 'vendeu' | 'sem-movimento' | 'reposicao';
type PromoFilter = 'todas' | 'ativa' | 'expirada';

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
    console.log('[Promo Debug] now:', now.toISOString());
    console.log('[Promo Debug] sample data_fim_promocao:', atualItems.slice(0, 5).map(i => i.data_fim_promocao));

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
    return comparisons.filter(c => {
      if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
      if (promoFilter === 'ativa' && !c.promoAtiva) return false;
      if (promoFilter === 'expirada' && c.promoAtiva) return false;
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
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-center">Validade Promo</TableHead>
                  <TableHead className="text-right">Preço Tabela</TableHead>
                  <TableHead className="text-right">Preço Promo</TableHead>
                  <TableHead className="text-center">Desconto</TableHead>
                  <TableHead className="text-right">Qtd Anterior</TableHead>
                  <TableHead className="text-right">Qtd Atual</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(item => {
                  const cfg = STATUS_CONFIG[item.status];
                  return (
                    <TableRow key={item.produtoId} className={item.promoAtiva ? 'bg-orange-50 dark:bg-orange-950/20' : ''}>
                      <TableCell className="font-mono text-sm">{item.codigo}</TableCell>
                      <TableCell className="max-w-[250px] truncate">{item.descricao}</TableCell>
                      <TableCell className="text-center">
                        <span className={item.promoAtiva ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}>
                          {formatDate(item.dataFimPromocao)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(item.precoTabela)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(item.valorPromocao)}</TableCell>
                      <TableCell className="text-center">
                        {item.percentualDesconto > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            -{item.percentualDesconto.toFixed(0)}%
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(item.qtdAnterior)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(item.qtdAtual)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        <span className={item.delta > 0 ? 'text-emerald-600' : item.delta < 0 ? 'text-amber-600' : 'text-muted-foreground'}>
                          {item.delta > 0 ? `+${formatNumber(item.delta)}` : formatNumber(item.delta)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={cfg.variant} className={cfg.className}>
                          {cfg.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
