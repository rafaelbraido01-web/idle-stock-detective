import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useInventory } from '@/store/InventoryContext';
import { AgingBadge } from '@/components/AgingBadge';
import { formatCurrency, formatNumber, formatDate } from '@/types/inventory';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface ProductDrawerProps {
  produtoId: string | null;
  onClose: () => void;
}

export function ProductDrawer({ produtoId, onClose }: ProductDrawerProps) {
  const { produtos, getProdutoHistory, getLatestProdutoSnapshots } = useInventory();
  const produto = produtos.find(p => p.id === produtoId);
  const history = produtoId ? getProdutoHistory(produtoId) : [];
  const latestSnap = getLatestProdutoSnapshots().find(ps => ps.produto_id === produtoId);

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
                <p className="text-lg font-mono font-semibold">{formatNumber(latestSnap.quantidade)}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Valor Total</p>
                <p className="text-lg font-mono font-semibold">{formatCurrency(latestSnap.valor_total)}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Última Venda</p>
                <p className="text-sm font-mono">{latestSnap.data_ultima_venda ? formatDate(latestSnap.data_ultima_venda) : '—'}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Dias s/ Venda</p>
                <p className="text-lg font-mono font-semibold">{latestSnap.dias_sem_venda < 0 ? '—' : latestSnap.dias_sem_venda}</p>
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
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
