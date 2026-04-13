import { useState, useMemo, useEffect, useCallback } from 'react';
import { useInventory } from '@/store/InventoryContext';
import { formatCurrency, formatDate, parseLocalDate } from '@/types/inventory';
import { supabase } from '@/integrations/supabase/client';
import {
  Search, ExternalLink, Loader2, CheckCircle2, ShoppingCart,
  Eye, EyeOff, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight,
  Pencil, Trash2,
} from 'lucide-react';
import MarketPriceAnalytics, { type ChartFilter } from '@/components/MarketPriceAnalytics';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface PriceResult {
  source: string;
  productName: string;
  price: number;
  url: string;
}

interface ProductPriceData {
  results: PriceResult[];
  citations?: string[];
}

interface MarketPrice {
  id: string;
  produto_id: string;
  preco: number;
  fonte: string;
  updated_at: string;
}

type SortKey = 'codigo' | 'descricao' | 'quantidade' | 'preco_tabela' | 'valor_promocao' | 'preco_mercado' | 'updated_at' | 'diff';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 25;

export default function PrecoMercado() {
  const { produtos, getLatestProdutoSnapshots } = useInventory();
  const latestSnapshots = getLatestProdutoSnapshots();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [onlyActivePromo, setOnlyActivePromo] = useState(false);
  const [showAutoSearch, setShowAutoSearch] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState<Record<string, boolean>>({});
  const [priceResults, setPriceResults] = useState<Record<string, ProductPriceData>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('descricao');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);
  const [marketPrices, setMarketPrices] = useState<Record<string, MarketPrice>>({});
  const [allMarketPricesForAnalytics, setAllMarketPricesForAnalytics] = useState<Array<{ produto_id: string; preco: number; fonte: string }>>([]);
  const [allMarketPricesFull, setAllMarketPricesFull] = useState<MarketPrice[]>([]);
  const [chartFilter, setChartFilter] = useState<ChartFilter>(null);

  // Edit/Delete state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingPrice, setEditingPrice] = useState<MarketPrice | null>(null);
  const [editPreco, setEditPreco] = useState('');
  const [editFonte, setEditFonte] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingPrice, setDeletingPrice] = useState(false);

  const FONTES = ['Mercado Livre', 'Kabum', 'Pichau', 'Amazon', 'Magazine Luiza', 'Netshoes', 'Outro'];

  // Fetch saved market prices
  useEffect(() => {
    const fetchMarketPrices = async () => {
      const { data, error } = await supabase
        .from('precos_mercado')
        .select('id, produto_id, preco, updated_at, fonte')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching market prices:', error);
        return;
      }

      // Store all prices for analytics (lightweight) and full data for table expansion
      setAllMarketPricesForAnalytics((data || []).map(r => ({ produto_id: r.produto_id, preco: r.preco, fonte: r.fonte })));
      setAllMarketPricesFull((data || []) as MarketPrice[]);

      // Group by produto_id keeping only the most recent
      const map: Record<string, MarketPrice> = {};
      for (const row of data || []) {
        if (!map[row.produto_id]) {
          map[row.produto_id] = row as MarketPrice;
        }
      }
      setMarketPrices(map);
    };

    fetchMarketPrices();
  }, []);

  const productsWithSnapshot = useMemo(() => {
    return latestSnapshots.map(snap => {
      const produto = produtos.find(p => p.id === snap.produto_id);
      return produto ? { ...produto, snap } : null;
    }).filter(Boolean) as Array<{
      id: string; codigo: string; descricao: string; marca: string;
      snap: typeof latestSnapshots[0];
    }>;
  }, [latestSnapshots, produtos]);

  // Helper: returns effective price considering active promotions
  const getEffectivePrice = useCallback((snap: typeof latestSnapshots[0]) => {
    const today = new Date(new Date().toDateString());
    if (snap.valor_promocao && snap.data_fim_promocao && parseLocalDate(snap.data_fim_promocao) >= today) {
      return snap.valor_promocao;
    }
    return snap.preco_tabela;
  }, []);

  // Compute price category per product for chart filtering
  const priceCategories = useMemo(() => {
    const pricesByProduct: Record<string, number[]> = {};
    for (const row of allMarketPricesForAnalytics) {
      if (!pricesByProduct[row.produto_id]) pricesByProduct[row.produto_id] = [];
      pricesByProduct[row.produto_id].push(row.preco);
    }
    const categories: Record<string, 'much_cheaper' | 'cheaper' | 'more_expensive' | 'much_expensive'> = {};
    for (const p of productsWithSnapshot) {
      const prices = pricesByProduct[p.codigo];
      if (!prices || p.snap.preco_tabela === 0) continue;
      const validPrices = prices.filter(pr => pr > 10);
      if (validPrices.length === 0) continue;
      const minPrice = Math.min(...validPrices);
      const efetivo = getEffectivePrice(p.snap);
      const diff = ((efetivo - minPrice) / minPrice) * 100;
      categories[p.codigo] = diff < -5 ? 'much_cheaper' : diff < 0 ? 'cheaper' : diff <= 5 ? 'more_expensive' : 'much_expensive';
    }
    return categories;
  }, [allMarketPricesForAnalytics, productsWithSnapshot, getEffectivePrice]);

  const filtered = useMemo(() => {
    let items = productsWithSnapshot;
    if (onlyActivePromo) {
      items = items.filter(p =>
        p.snap.data_fim_promocao &&
        parseLocalDate(p.snap.data_fim_promocao) >= new Date(new Date().toDateString())
      );
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      items = items.filter(p =>
        p.descricao.toLowerCase().includes(term) ||
        p.codigo.toLowerCase().includes(term) ||
        p.marca.toLowerCase().includes(term)
      );
    }
    // Apply chart filter
    if (chartFilter) {
      if (chartFilter.type === 'category') {
        items = items.filter(p => priceCategories[p.codigo] === chartFilter.value);
      } else if (chartFilter.type === 'product') {
        items = items.filter(p => p.codigo === chartFilter.codigo);
      }
    }
    return items;
  }, [productsWithSnapshot, searchTerm, onlyActivePromo, chartFilter, priceCategories]);

  const getDiff = useCallback((product: typeof productsWithSnapshot[0]) => {
    const mp = marketPrices[product.codigo];
    if (!mp) return null;
    const efetivo = getEffectivePrice(product.snap);
    if (efetivo === 0 || mp.preco === 0) return null;
    return ((efetivo - mp.preco) / mp.preco) * 100;
  }, [marketPrices, getEffectivePrice]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;
      switch (sortKey) {
        case 'codigo': va = a.codigo; vb = b.codigo; break;
        case 'descricao': va = a.descricao.toLowerCase(); vb = b.descricao.toLowerCase(); break;
        case 'quantidade': va = a.snap.quantidade; vb = b.snap.quantidade; break;
        case 'preco_tabela': va = a.snap.preco_tabela; vb = b.snap.preco_tabela; break;
        case 'valor_promocao': va = a.snap.valor_promocao ?? 0; vb = b.snap.valor_promocao ?? 0; break;
        case 'preco_mercado':
          va = marketPrices[a.codigo]?.preco ?? -1;
          vb = marketPrices[b.codigo]?.preco ?? -1;
          break;
        case 'updated_at':
          va = marketPrices[a.codigo]?.updated_at ?? '';
          vb = marketPrices[b.codigo]?.updated_at ?? '';
          break;
        case 'diff':
          va = getDiff(a) ?? -9999;
          vb = getDiff(b) ?? -9999;
          break;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir, marketPrices, getDiff]);

  // When chart filter is active, expand to show all market prices per product
  const expandedRows = useMemo(() => {
    if (!chartFilter) return null;
    const pricesByProduct: Record<string, MarketPrice[]> = {};
    for (const mp of allMarketPricesFull) {
      if (!pricesByProduct[mp.produto_id]) pricesByProduct[mp.produto_id] = [];
      pricesByProduct[mp.produto_id].push(mp);
    }
    return pricesByProduct;
  }, [chartFilter, allMarketPricesFull]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [searchTerm, onlyActivePromo, sortKey, sortDir, chartFilter]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const getProvider = () => localStorage.getItem('preco-mercado-provider') || 'scraper';

  const handleSearch = async (productId: string, productName: string, productCode: string) => {
    setLoadingProducts(prev => ({ ...prev, [productId]: true }));
    try {
      const provider = getProvider();
      const functionName = provider === 'scraper' ? 'search-product-scraper' : 'search-product-price';
      const body = provider === 'scraper'
        ? { productName, productCode }
        : { productName, productCode, provider };

      const { data, error } = await supabase.functions.invoke(functionName, { body });
      if (error) throw error;

      if (data?.success) {
        setPriceResults(prev => ({
          ...prev,
          [productId]: { results: data.data.results, citations: data.citations },
        }));
        setSelectedProduct(productId);
        setDialogOpen(true);
      } else {
        toast({ title: 'Erro na pesquisa', description: data?.error || 'Não foi possível pesquisar preços.', variant: 'destructive' });
      }
    } catch (err: any) {
      console.error('Price search error:', err);
      toast({ title: 'Erro', description: err.message || 'Falha ao pesquisar preços online.', variant: 'destructive' });
    } finally {
      setLoadingProducts(prev => ({ ...prev, [productId]: false }));
    }
  };

  const openResults = (productId: string) => {
    setSelectedProduct(productId);
    setDialogOpen(true);
  };

  const handleEditOpen = (mp: MarketPrice) => {
    setEditingPrice(mp);
    setEditPreco(String(mp.preco));
    setEditFonte(mp.fonte);
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingPrice) return;
    const preco = parseFloat(editPreco);
    if (isNaN(preco) || preco <= 0) {
      toast({ title: 'Valor inválido', description: 'Informe um preço válido.', variant: 'destructive' });
      return;
    }
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from('precos_mercado')
        .update({ preco, fonte: editFonte })
        .eq('id', editingPrice.id);
      if (error) throw error;
      // Update local state
      setMarketPrices(prev => {
        const updated = { ...prev };
        if (updated[editingPrice.produto_id]) {
          updated[editingPrice.produto_id] = { ...updated[editingPrice.produto_id], preco, fonte: editFonte };
        }
        return updated;
      });
      toast({ title: 'Preço atualizado com sucesso' });
      setEditDialogOpen(false);
    } catch (err: any) {
      toast({ title: 'Erro ao atualizar', description: err.message, variant: 'destructive' });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteOpen = (mp: MarketPrice) => {
    setEditingPrice(mp);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!editingPrice) return;
    setDeletingPrice(true);
    try {
      const { error } = await supabase
        .from('precos_mercado')
        .delete()
        .eq('id', editingPrice.id);
      if (error) throw error;
      // Remove from local state
      setMarketPrices(prev => {
        const updated = { ...prev };
        delete updated[editingPrice.produto_id];
        return updated;
      });
      toast({ title: 'Preço removido com sucesso' });
      setDeleteDialogOpen(false);
    } catch (err: any) {
      toast({ title: 'Erro ao remover', description: err.message, variant: 'destructive' });
    } finally {
      setDeletingPrice(false);
    }
  };

  const selectedData = selectedProduct ? priceResults[selectedProduct] : null;
  const selectedProduto = selectedProduct ? productsWithSnapshot.find(p => p.id === selectedProduct) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Preço de Mercado</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Compare os preços do seu estoque com os preços praticados no mercado.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAutoSearch(prev => !prev)}
          className="gap-1.5"
        >
          {showAutoSearch ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showAutoSearch ? 'Ocultar Pesquisa Online' : 'Pesquisa Online'}
        </Button>
      </div>

      {productsWithSnapshot.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium">Nenhum produto em estoque</p>
          <p className="text-sm">Importe um relatório para começar a pesquisar preços.</p>
        </div>
      ) : (
        <>
          <MarketPriceAnalytics
            allMarketPrices={allMarketPricesForAnalytics}
            productsWithSnapshot={productsWithSnapshot}
            activeFilter={chartFilter}
            onFilterChange={setChartFilter}
          />
          <div className="flex items-center gap-4 max-w-lg">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por descrição, código ou marca..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="promo-filter"
                checked={onlyActivePromo}
                onCheckedChange={(v) => setOnlyActivePromo(!!v)}
              />
              <Label htmlFor="promo-filter" className="text-sm whitespace-nowrap cursor-pointer">
                Promoção ativa
              </Label>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px] cursor-pointer select-none" onClick={() => toggleSort('codigo')}>
                    <span className="inline-flex items-center">Código <SortIcon col="codigo" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('descricao')}>
                    <span className="inline-flex items-center">Descrição <SortIcon col="descricao" /></span>
                  </TableHead>
                  <TableHead className="w-[80px] text-right cursor-pointer select-none" onClick={() => toggleSort('quantidade')}>
                    <span className="inline-flex items-center justify-end w-full">Qtd <SortIcon col="quantidade" /></span>
                  </TableHead>
                  <TableHead className="w-[120px] text-right cursor-pointer select-none" onClick={() => toggleSort('preco_tabela')}>
                    <span className="inline-flex items-center justify-end w-full">Preço Tabela <SortIcon col="preco_tabela" /></span>
                  </TableHead>
                  <TableHead className="w-[120px] text-right cursor-pointer select-none" onClick={() => toggleSort('valor_promocao')}>
                    <span className="inline-flex items-center justify-end w-full">Promoção <SortIcon col="valor_promocao" /></span>
                  </TableHead>
                  <TableHead className="w-[120px] text-right cursor-pointer select-none" onClick={() => toggleSort('preco_mercado')}>
                    <span className="inline-flex items-center justify-end w-full">Preço Mercado <SortIcon col="preco_mercado" /></span>
                  </TableHead>
                  <TableHead className="w-[90px] text-center">Fonte</TableHead>
                  <TableHead className="w-[100px] text-center cursor-pointer select-none" onClick={() => toggleSort('updated_at')}>
                    <span className="inline-flex items-center justify-center w-full">Atualizado <SortIcon col="updated_at" /></span>
                  </TableHead>
                  <TableHead className="w-[90px] text-right cursor-pointer select-none" onClick={() => toggleSort('diff')}>
                    <span className="inline-flex items-center justify-end w-full">Dif % <SortIcon col="diff" /></span>
                  </TableHead>
                  <TableHead className="w-[80px] text-center">Editar</TableHead>
                  {showAutoSearch && (
                    <TableHead className="w-[180px] text-center">Ação</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((p) => {
                  const isLoading = loadingProducts[p.id];
                  const hasResult = !!priceResults[p.id];
                  const hasActivePromo = !!(
                    p.snap.data_fim_promocao &&
                    parseLocalDate(p.snap.data_fim_promocao) >= new Date(new Date().toDateString())
                  );

                  // When chart filter active, show all prices; otherwise show only latest
                  const productPrices = expandedRows
                    ? (expandedRows[p.codigo] || [])
                    : (marketPrices[p.codigo] ? [marketPrices[p.codigo]] : []);

                  if (productPrices.length === 0) {
                    // No market price — single row
                    return (
                      <TableRow key={p.id} className={hasActivePromo ? 'bg-orange-50' : ''}>
                        <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
                        <TableCell className="font-medium text-sm">{p.descricao}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.snap.quantidade}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(p.snap.preco_tabela)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.snap.valor_promocao ? formatCurrency(p.snap.valor_promocao) : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">—</TableCell>
                        <TableCell className="text-center">—</TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">—</TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-medium">—</TableCell>
                        <TableCell className="text-center">—</TableCell>
                        {showAutoSearch && (
                          <TableCell className="text-center">
                            <Button
                              variant="default" size="sm" disabled={isLoading}
                              onClick={() => handleSearch(p.id, `${p.descricao} ${p.marca}`, p.codigo)}
                              className="gap-1.5"
                            >
                              {isLoading ? (
                                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Pesquisando...</>
                              ) : (
                                <><Search className="h-3.5 w-3.5" /> Pesquisar</>
                              )}
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  }

                  return productPrices.map((mp, mpIdx) => {
                    const efetivo = getEffectivePrice(p.snap);
                    const rowDiff = efetivo > 0 && mp.preco > 0 ? ((efetivo - mp.preco) / mp.preco) * 100 : null;
                    const isFirst = mpIdx === 0;

                    return (
                      <TableRow
                        key={`${p.id}-${mp.id}`}
                        className={`${hasActivePromo ? 'bg-orange-50' : ''} ${!isFirst && expandedRows ? 'border-t-0 bg-muted/30' : ''}`}
                      >
                        <TableCell className="font-mono text-xs">{isFirst ? p.codigo : ''}</TableCell>
                        <TableCell className="font-medium text-sm">{isFirst ? p.descricao : ''}</TableCell>
                        <TableCell className="text-right tabular-nums">{isFirst ? p.snap.quantidade : ''}</TableCell>
                        <TableCell className="text-right tabular-nums">{isFirst ? formatCurrency(p.snap.preco_tabela) : ''}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {isFirst ? (p.snap.valor_promocao ? formatCurrency(p.snap.valor_promocao) : '—') : ''}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {formatCurrency(mp.preco)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="text-xs">{mp.fonte}</Badge>
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">
                          {formatDate(mp.updated_at)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-medium">
                          {rowDiff !== null ? (
                            <span className={rowDiff > 0 ? 'text-green-600' : rowDiff < 0 ? 'text-red-600' : 'text-muted-foreground'}>
                              {rowDiff > 0 ? '+' : ''}{rowDiff.toFixed(1)}%
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditOpen(mp)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteOpen(mp)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                        {showAutoSearch && isFirst && (
                          <TableCell className="text-center" rowSpan={productPrices.length}>
                            {hasResult ? (
                              <Button variant="outline" size="sm" onClick={() => openResults(p.id)} className="gap-1.5">
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                Ver resultados
                              </Button>
                            ) : (
                              <Button
                                variant="default" size="sm" disabled={isLoading}
                                onClick={() => handleSearch(p.id, `${p.descricao} ${p.marca}`, p.codigo)}
                                className="gap-1.5"
                              >
                                {isLoading ? (
                                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Pesquisando...</>
                                ) : (
                                  <><Search className="h-3.5 w-3.5" /> Pesquisar</>
                                )}
                              </Button>
                            )}
                          </TableCell>
                        )}
                        {showAutoSearch && !isFirst && expandedRows && <TableCell />}
                      </TableRow>
                    );
                  });
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} de {sorted.length} produtos
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Results Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">Resultados da Pesquisa</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-1">
              {selectedProduto
                ? `${selectedProduto.descricao} — ${selectedProduto.marca}`
                : 'Resultados encontrados para o produto selecionado.'}
            </DialogDescription>
          </DialogHeader>

          {selectedData?.results && selectedData.results.length > 0 ? (
            <div className="space-y-4 py-2">
              {selectedData.results.map((result, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{result.source}</Badge>
                    <span className="text-lg font-bold text-foreground">{formatCurrency(result.price)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{result.productName}</p>
                  <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir link para validar
                  </a>
                </div>
              ))}
              {selectedProduto && (
                <div className="border-t pt-3 mt-3 space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Preço tabela atual: <strong>{formatCurrency(selectedProduto.snap.preco_tabela)}</strong>
                  </p>
                  {selectedProduto.snap.valor_promocao ? (
                    <p className="text-xs text-orange-600 font-medium">
                      Preço promoção: <strong>{formatCurrency(selectedProduto.snap.valor_promocao)}</strong>
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum resultado encontrado.</p>
          )}

          <DialogFooter>
            <Button onClick={() => setDialogOpen(false)}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Price Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Editar Preço de Mercado</DialogTitle>
            <DialogDescription>Altere o valor ou a fonte do preço registrado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Preço (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={editPreco}
                onChange={e => setEditPreco(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Fonte</Label>
              <Select value={editFonte} onValueChange={setEditFonte}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONTES.map(f => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={savingEdit}>Cancelar</Button>
            <Button onClick={handleEditSave} disabled={savingEdit}>
              {savingEdit ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Salvando...</> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Price Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remover Preço de Mercado</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover este registro de preço? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          {editingPrice && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p><strong>Valor:</strong> {formatCurrency(editingPrice.preco)}</p>
              <p><strong>Fonte:</strong> {editingPrice.fonte}</p>
              <p><strong>Data:</strong> {formatDate(editingPrice.updated_at)}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deletingPrice}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deletingPrice}>
              {deletingPrice ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Removendo...</> : 'Remover'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
