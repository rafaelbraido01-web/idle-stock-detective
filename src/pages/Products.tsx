import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpDown, Search } from 'lucide-react';
import { useInventory } from '@/store/InventoryContext';
import { AgingBadge } from '@/components/AgingBadge';
import { formatCurrency, formatNumber, formatDate, AGING_CATEGORIES, type CategoriaEstoque } from '@/types/inventory';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductDrawer } from '@/components/ProductDrawer';

type SortKey = 'valor_total' | 'dias_sem_venda' | 'quantidade';

export default function Products() {
  const { produtos, getLatestProdutoSnapshots } = useInventory();
  const latestSnapshots = getLatestProdutoSnapshots();

  const [search, setSearch] = useState('');
  const [grupoFilter, setGrupoFilter] = useState('all');
  const [categoriaFilter, setCategoriaFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('valor_total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedProdutoId, setSelectedProdutoId] = useState<string | null>(null);

  const enriched = useMemo(() => {
    return latestSnapshots.map(ps => {
      const produto = produtos.find(p => p.id === ps.produto_id);
      return { ...ps, produto };
    });
  }, [latestSnapshots, produtos]);

  const grupos = useMemo(() => [...new Set(produtos.map(p => p.grupo).filter(Boolean))].sort(), [produtos]);

  const filtered = useMemo(() => {
    let result = enriched;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.produto?.codigo.toLowerCase().includes(q) ||
        r.produto?.descricao.toLowerCase().includes(q)
      );
    }
    if (grupoFilter !== 'all') {
      result = result.filter(r => r.produto?.grupo === grupoFilter);
    }
    if (categoriaFilter !== 'all') {
      result = result.filter(r => r.categoria_estoque === categoriaFilter);
    }
    result.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      return sortDir === 'desc' ? (vb as number) - (va as number) : (va as number) - (vb as number);
    });
    return result;
  }, [enriched, search, grupoFilter, categoriaFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
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
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={grupoFilter} onValueChange={setGrupoFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Grupo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os grupos</SelectItem>
                {grupos.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={categoriaFilter} onValueChange={setCategoriaFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {AGING_CATEGORIES.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
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
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Código</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Descrição</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Grupo</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('quantidade')}>
                      <span className="inline-flex items-center gap-1">Qtd <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('valor_total')}>
                      <span className="inline-flex items-center gap-1">Valor Total <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Última Venda</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('dias_sem_venda')}>
                      <span className="inline-flex items-center gap-1">Dias s/ Venda <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr
                      key={item.id}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors duration-150 cursor-pointer"
                      onClick={() => setSelectedProdutoId(item.produto_id)}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground">{item.produto?.codigo}</td>
                      <td className="px-4 py-2.5 text-foreground max-w-[300px] truncate">{item.produto?.descricao}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{item.produto?.grupo}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-foreground">{formatNumber(item.quantidade)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-foreground">{formatCurrency(item.valor_total)}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                        {item.data_ultima_venda ? formatDate(item.data_ultima_venda) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-foreground">{item.dias_sem_venda >= 9999 ? '—' : item.dias_sem_venda}</td>
                      <td className="px-4 py-2.5 text-center"><AgingBadge dias={item.dias_sem_venda} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
