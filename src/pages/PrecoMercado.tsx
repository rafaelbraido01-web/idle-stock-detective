import { useState, useMemo } from 'react';
import { useInventory } from '@/store/InventoryContext';
import { formatCurrency } from '@/types/inventory';
import { supabase } from '@/integrations/supabase/client';
import { Search, ExternalLink, Loader2, CheckCircle2, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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

export default function PrecoMercado() {
  const { produtos, getLatestProdutoSnapshots } = useInventory();
  const latestSnapshots = getLatestProdutoSnapshots();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [loadingProducts, setLoadingProducts] = useState<Record<string, boolean>>({});
  const [priceResults, setPriceResults] = useState<Record<string, ProductPriceData>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

  const productsWithSnapshot = useMemo(() => {
    return latestSnapshots.map(snap => {
      const produto = produtos.find(p => p.id === snap.produto_id);
      return produto ? { ...produto, snap } : null;
    }).filter(Boolean) as Array<{ id: string; codigo: string; descricao: string; marca: string; snap: typeof latestSnapshots[0] }>;
  }, [latestSnapshots, produtos]);

  const filtered = useMemo(() => {
    if (!searchTerm) return productsWithSnapshot;
    const term = searchTerm.toLowerCase();
    return productsWithSnapshot.filter(p =>
      p.descricao.toLowerCase().includes(term) ||
      p.codigo.toLowerCase().includes(term) ||
      p.marca.toLowerCase().includes(term)
    );
  }, [productsWithSnapshot, searchTerm]);

  const getProvider = () => localStorage.getItem('preco-mercado-provider') || 'perplexity';

  const handleSearch = async (productId: string, productName: string, productCode: string) => {
    setLoadingProducts(prev => ({ ...prev, [productId]: true }));

    try {
      const { data, error } = await supabase.functions.invoke('search-product-price', {
        body: { productName, productCode, provider: getProvider() },
      });

      if (error) throw error;

      if (data?.success) {
        setPriceResults(prev => ({
          ...prev,
          [productId]: { results: data.data.results, citations: data.citations },
        }));
        setSelectedProduct(productId);
        setDialogOpen(true);
      } else {
        toast({
          title: 'Erro na pesquisa',
          description: data?.error || 'Não foi possível pesquisar preços.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      console.error('Price search error:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Falha ao pesquisar preços online.',
        variant: 'destructive',
      });
    } finally {
      setLoadingProducts(prev => ({ ...prev, [productId]: false }));
    }
  };

  const openResults = (productId: string) => {
    setSelectedProduct(productId);
    setDialogOpen(true);
  };

  const selectedData = selectedProduct ? priceResults[selectedProduct] : null;
  const selectedProduto = selectedProduct ? productsWithSnapshot.find(p => p.id === selectedProduct) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Preço de Mercado</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pesquise preços online dos seus produtos no Mercado Livre, Kabum e outras fontes.
        </p>
      </div>

      {productsWithSnapshot.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium">Nenhum produto em estoque</p>
          <p className="text-sm">Importe um relatório para começar a pesquisar preços.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por descrição, código ou marca..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[120px]">Marca</TableHead>
                  <TableHead className="w-[100px] text-right">Qtd</TableHead>
                  <TableHead className="w-[130px] text-right">Preço Tabela</TableHead>
                  <TableHead className="w-[180px] text-center">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const isLoading = loadingProducts[p.id];
                  const hasResult = !!priceResults[p.id];

                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
                      <TableCell className="font-medium text-sm">{p.descricao}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.marca}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.snap.quantidade}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(p.snap.preco_tabela)}</TableCell>
                      <TableCell className="text-center">
                        {hasResult ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openResults(p.id)}
                            className="gap-1.5"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                            Ver resultados
                          </Button>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            disabled={isLoading}
                            onClick={() => handleSearch(p.id, `${p.descricao} ${p.marca}`, p.codigo)}
                            className="gap-1.5"
                          >
                            {isLoading ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Pesquisando...
                              </>
                            ) : (
                              <>
                                <Search className="h-3.5 w-3.5" />
                                Pesquisar preço online
                              </>
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            Mostrando {filtered.length} de {productsWithSnapshot.length} produtos
          </p>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">Resultados da Pesquisa</DialogTitle>
            {selectedProduto && (
              <p className="text-sm text-muted-foreground mt-1">
                {selectedProduto.descricao} — {selectedProduto.marca}
              </p>
            )}
          </DialogHeader>

          {selectedData?.results && selectedData.results.length > 0 ? (
            <div className="space-y-4 py-2">
              {selectedData.results.map((result, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{result.source}</Badge>
                    <span className="text-lg font-bold text-foreground">
                      {formatCurrency(result.price)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {result.productName}
                  </p>
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Abrir link para validar
                  </a>
                </div>
              ))}

              {selectedProduto && (
                <div className="border-t pt-3 mt-3">
                  <p className="text-xs text-muted-foreground">
                    Preço tabela atual: <strong>{formatCurrency(selectedProduto.snap.preco_tabela)}</strong>
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhum resultado encontrado.
            </p>
          )}

          <DialogFooter>
            <Button onClick={() => setDialogOpen(false)}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
