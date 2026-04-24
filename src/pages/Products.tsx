import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpDown, Search, ChevronLeft, ChevronRight, AlertTriangle, Check, X } from 'lucide-react';
import { useInventory } from '@/store/InventoryContext';
import { AgingBadge } from '@/components/AgingBadge';
import { formatCurrency, formatNumber, formatDate, AGING_CATEGORIES, type CategoriaEstoque } from '@/types/inventory';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ProductDrawer } from '@/components/ProductDrawer';

type SortKey = 'codigo' | 'descricao' | 'grupo' | 'marca' | 'quantidade' | 'valor_unitario' | 'preco_tabela' | 'valor_promocao' | 'valor_total' | 'valor_venda_total' | 'dias_sem_venda' | 'categoria_estoque';
const PAGE_SIZE = 50;

export default function Products() {
  const { produtos, getLatestProdutoSnapshots } = useInventory();
  const latestSnapshots = getLatestProdutoSnapshots();

  const [search, setSearch] = useState('');
  const [grupoFilter, setGrupoFilter] = useState('all');
  const [subgrupoFilter, setSubgrupoFilter] = useState('all');
  const [marcaFilter, setMarcaFilter] = useState<string[]>([]);
  const [marcaSearch, setMarcaSearch] = useState('');
  const [comissaoFilter, setComissaoFilter] = useState('all');
  const [compraFilter, setCompraFilter] = useState('all');
  const [categoriaFilter, setCategoriaFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('valor_total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedProdutoId, setSelectedProdutoId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const enriched = useMemo(() => {
    return latestSnapshots.map(ps => {
      const produto = produtos.find(p => p.id === ps.produto_id);
      return { ...ps, produto };
    });
  }, [latestSnapshots, produtos]);

  const grupos = useMemo(() => [...new Set(produtos.map(p => p.grupo).filter(Boolean))].sort(), [produtos]);
  const subgrupos = useMemo(() => [...new Set(produtos.map(p => p.subgrupo).filter(Boolean))].sort(), [produtos]);
  const marcas = useMemo(() => [...new Set(produtos.map(p => p.marca).filter(Boolean))].sort(), [produtos]);
  const tiposComissao = useMemo(() => [...new Set(latestSnapshots.map(ps => ps.nome_comissao).filter(Boolean))].sort(), [latestSnapshots]);

  const filtered = useMemo(() => {
    let result = enriched;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.produto?.codigo.toLowerCase().includes(q) ||
        r.produto?.descricao.toLowerCase().includes(q)
      );
    }
    if (grupoFilter !== 'all') result = result.filter(r => r.produto?.grupo === grupoFilter);
    if (subgrupoFilter !== 'all') result = result.filter(r => r.produto?.subgrupo === subgrupoFilter);
    if (marcaFilter.length > 0) result = result.filter(r => r.produto?.marca && marcaFilter.includes(r.produto.marca));
    if (comissaoFilter === 'com-fixa') result = result.filter(r => r.nome_comissao && r.nome_comissao.toLowerCase().includes('fix'));
    else if (comissaoFilter === 'com-comissao') result = result.filter(r => r.nome_comissao);
    else if (comissaoFilter === 'sem-comissao') result = result.filter(r => !r.nome_comissao);
    else if (comissaoFilter !== 'all') result = result.filter(r => r.nome_comissao === comissaoFilter);
    if (compraFilter === 'lt90') result = result.filter(r => r.dias_sem_compra >= 0 && r.dias_sem_compra < 90);
    else if (compraFilter === '90-180') result = result.filter(r => r.dias_sem_compra >= 90 && r.dias_sem_compra <= 180);
    else if (compraFilter === 'gt180') result = result.filter(r => r.dias_sem_compra > 180);
    else if (compraFilter === 'sem-registro') result = result.filter(r => r.dias_sem_compra < 0);
    if (categoriaFilter !== 'all') result = result.filter(r => r.categoria_estoque === categoriaFilter);

    result.sort((a, b) => {
      let va: any, vb: any;
      if (sortKey === 'codigo') { va = a.produto?.codigo || ''; vb = b.produto?.codigo || ''; }
      else if (sortKey === 'descricao') { va = a.produto?.descricao || ''; vb = b.produto?.descricao || ''; }
      else if (sortKey === 'grupo') { va = a.produto?.grupo || ''; vb = b.produto?.grupo || ''; }
      else if (sortKey === 'marca') { va = a.produto?.marca || ''; vb = b.produto?.marca || ''; }
      else { va = a[sortKey] ?? 0; vb = b[sortKey] ?? 0; }
      if (typeof va === 'string') {
        const cmp = va.localeCompare(vb as string);
        return sortDir === 'desc' ? -cmp : cmp;
      }
      return sortDir === 'desc' ? (vb as number) - (va as number) : (va as number) - (vb as number);
    });
    return result;
  }, [enriched, search, grupoFilter, subgrupoFilter, marcaFilter, comissaoFilter, compraFilter, categoriaFilter, sortKey, sortDir]);

  // Reset page when filters change
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paginated = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
    setPage(0);
  };

  const isEmpty = latestSnapshots.length === 0;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground tracking-tight">Produtos</h1>

      {isEmpty ? (
        <div className="bg-card rounded-xl shadow-card p-12 text-center">
          <p className="text-sm text-muted-foreground">Nenhum produto importado ainda.</p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
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
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[180px] justify-between font-normal">
                  <span className="truncate">
                    {marcaFilter.length === 0
                      ? 'Todas as marcas'
                      : marcaFilter.length === 1
                        ? marcaFilter[0]
                        : `${marcaFilter.length} marcas`}
                  </span>
                  {marcaFilter.length > 0 && (
                    <X
                      className="h-3.5 w-3.5 opacity-60 hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); setMarcaFilter([]); setPage(0); }}
                    />
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
                    <button
                      onClick={() => { setMarcaFilter([]); setPage(0); }}
                      className="text-xs text-primary hover:underline"
                    >
                      Limpar
                    </button>
                  )}
                </div>
                <div className="max-h-[280px] overflow-y-auto">
                  {marcas
                    .filter(m => m.toLowerCase().includes(marcaSearch.toLowerCase()))
                    .map(m => {
                      const checked = marcaFilter.includes(m);
                      return (
                        <button
                          key={m}
                          onClick={() => {
                            setMarcaFilter(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
                            setPage(0);
                          }}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted text-left"
                        >
                          <div className={`h-4 w-4 rounded border flex items-center justify-center ${checked ? 'bg-primary border-primary' : 'border-input'}`}>
                            {checked && <Check className="h-3 w-3 text-primary-foreground" />}
                          </div>
                          <span className="truncate">{m}</span>
                        </button>
                      );
                    })}
                </div>
              </PopoverContent>
            </Popover>
            <Select value={categoriaFilter} onValueChange={v => { setCategoriaFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {AGING_CATEGORIES.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
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
            <Select value={comissaoFilter} onValueChange={v => { setComissaoFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[170px]"><SelectValue placeholder="Comissão" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas comissões</SelectItem>
                <SelectItem value="com-fixa">Comissão Fixa</SelectItem>
                <SelectItem value="com-comissao">Com comissão</SelectItem>
                <SelectItem value="sem-comissao">Sem comissão</SelectItem>
                {tiposComissao.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">{formatNumber(filtered.length)} produtos</p>

          {/* Table */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-card rounded-xl shadow-card overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('codigo')}>
                      <span className="inline-flex items-center gap-1">Código <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('descricao')}>
                      <span className="inline-flex items-center gap-1">Descrição <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('grupo')}>
                      <span className="inline-flex items-center gap-1">Grupo <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('marca')}>
                      <span className="inline-flex items-center gap-1">Marca <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('quantidade')}>
                      <span className="inline-flex items-center gap-1">Qtd <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('valor_unitario')}>
                      <span className="inline-flex items-center gap-1">Custo Médio <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('preco_tabela')}>
                      <span className="inline-flex items-center gap-1">Preço Tabela <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('valor_promocao')}>
                      <span className="inline-flex items-center gap-1">Promoção <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('valor_total')}>
                      <span className="inline-flex items-center gap-1">Vlr Estoque <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('valor_venda_total')}>
                      <span className="inline-flex items-center gap-1">Vlr Venda <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('dias_sem_venda')}>
                      <span className="inline-flex items-center gap-1">Dias s/ Venda <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('categoria_estoque')}>
                      <span className="inline-flex items-center gap-1">Status <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(item => {
                    const isHighQty = item.quantidade >= 100;
                    const isBelowMin = item.produto && item.produto.estoque_minimo > 0 && item.quantidade < item.produto.estoque_minimo;
                    return (
                      <tr
                        key={item.id}
                        className={`border-b last:border-0 hover:bg-muted/30 transition-colors duration-150 cursor-pointer ${isBelowMin ? 'bg-destructive/5' : ''}`}
                        onClick={() => setSelectedProdutoId(item.produto_id)}
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-foreground">{item.produto?.codigo}</td>
                        <td className="px-4 py-2.5 text-foreground max-w-[250px] truncate">{item.produto?.descricao}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{item.produto?.grupo}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{item.produto?.marca || '—'}</td>
                        <td className={`px-4 py-2.5 text-right font-mono ${isBelowMin ? 'text-destructive font-bold' : isHighQty ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-foreground'}`}>
                          {isBelowMin && <AlertTriangle className="inline h-3 w-3 mr-1" />}
                          {formatNumber(item.quantidade)}
                          {isHighQty && !isBelowMin && <span className="ml-1 text-[10px]">🔥</span>}
                          {isBelowMin && <span className="ml-1 text-[10px] text-destructive">(mín: {formatNumber(item.produto!.estoque_minimo)})</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-foreground">{formatCurrency(item.valor_unitario)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-foreground">{item.preco_tabela > 0 ? formatCurrency(item.preco_tabela) : '—'}</td>
                        <td className="px-4 py-2.5 text-right text-xs">
                          {item.valor_promocao ? (
                            <span className="inline-flex flex-col items-end">
                              <span className="font-mono text-green-600 dark:text-green-400 font-semibold">{formatCurrency(item.valor_promocao)}</span>
                              {item.percentual_desconto && (
                                <span className="text-[10px] text-green-600 dark:text-green-400">-{item.percentual_desconto.toFixed(1)}%</span>
                              )}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-foreground">{formatCurrency(item.valor_total)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-foreground">{item.valor_venda_total > 0 ? formatCurrency(item.valor_venda_total) : '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-foreground">{item.dias_sem_venda < 0 ? '—' : item.dias_sem_venda}</td>
                        <td className="px-4 py-2.5 text-center"><AgingBadge dias={item.dias_sem_venda} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-xs text-muted-foreground">
                  {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} de {formatNumber(filtered.length)}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={safePage === 0}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground px-2">
                    {safePage + 1} / {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={safePage >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}

      <ProductDrawer
        produtoId={selectedProdutoId}
        onClose={() => setSelectedProdutoId(null)}
      />
    </div>
  );
}
