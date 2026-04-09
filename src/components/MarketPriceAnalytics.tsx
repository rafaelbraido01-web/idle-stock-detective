import { useMemo } from 'react';
import { formatCurrency } from '@/types/inventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { TrendingDown, TrendingUp, BarChart3, ShoppingCart } from 'lucide-react';

interface MarketPriceRow {
  produto_id: string;
  preco: number;
  fonte: string;
}

interface ProductWithSnap {
  id: string;
  codigo: string;
  descricao: string;
  snap: {
    preco_tabela: number;
    valor_promocao: number | null;
  };
}

interface Props {
  allMarketPrices: MarketPriceRow[];
  productsWithSnapshot: ProductWithSnap[];
}

export default function MarketPriceAnalytics({ allMarketPrices, productsWithSnapshot }: Props) {
  const analysis = useMemo(() => {
    // Group all prices by produto_id → get min price per product
    const pricesByProduct: Record<string, number[]> = {};
    const sourcesByProduct: Record<string, Set<string>> = {};
    for (const row of allMarketPrices) {
      if (!pricesByProduct[row.produto_id]) {
        pricesByProduct[row.produto_id] = [];
        sourcesByProduct[row.produto_id] = new Set();
      }
      pricesByProduct[row.produto_id].push(row.preco);
      sourcesByProduct[row.produto_id].add(row.fonte);
    }

    // Only products that have both market price AND snapshot
    const productMap = new Map(productsWithSnapshot.map(p => [p.codigo, p]));
    
    const comparisons: Array<{
      codigo: string;
      descricao: string;
      precoTabela: number;
      precoEfetivo: number;
      minMercado: number;
      avgMercado: number;
      diffPercent: number;
      numFontes: number;
    }> = [];

    for (const [prodId, prices] of Object.entries(pricesByProduct)) {
      const product = productMap.get(prodId);
      if (!product || product.snap.preco_tabela === 0) continue;
      
      // Filter out obviously wrong prices (like 1.149 instead of 1149)
      const validPrices = prices.filter(p => p > 10);
      if (validPrices.length === 0) continue;

      const minPrice = Math.min(...validPrices);
      const avgPrice = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
      const efetivo = product.snap.valor_promocao || product.snap.preco_tabela;
      const diff = ((efetivo - minPrice) / minPrice) * 100;

      comparisons.push({
        codigo: prodId,
        descricao: product.descricao,
        precoTabela: product.snap.preco_tabela,
        precoEfetivo: efetivo,
        minMercado: minPrice,
        avgMercado: avgPrice,
        diffPercent: diff,
        numFontes: sourcesByProduct[prodId]?.size || 0,
      });
    }

    // KPIs
    const totalWithPrice = comparisons.length;
    const cheaper = comparisons.filter(c => c.diffPercent < -2);
    const similar = comparisons.filter(c => c.diffPercent >= -2 && c.diffPercent <= 2);
    const moreExpensive = comparisons.filter(c => c.diffPercent > 2);
    const avgDiff = totalWithPrice > 0 
      ? comparisons.reduce((sum, c) => sum + c.diffPercent, 0) / totalWithPrice 
      : 0;

    // Distribution for pie chart
    const distribution = [
      { name: 'Mais barato', value: cheaper.length, color: '#22c55e' },
      { name: 'Similar', value: similar.length, color: '#eab308' },
      { name: 'Mais caro', value: moreExpensive.length, color: '#ef4444' },
    ].filter(d => d.value > 0);

    // Top 10 most expensive vs market (where we're pricier)
    const topExpensive = [...comparisons]
      .filter(c => c.diffPercent > 0)
      .sort((a, b) => b.diffPercent - a.diffPercent)
      .slice(0, 8)
      .map(c => ({
        name: c.descricao.length > 30 ? c.descricao.slice(0, 28) + '…' : c.descricao,
        fullName: c.descricao,
        diff: Math.round(c.diffPercent),
        nosso: c.precoEfetivo,
        mercado: c.minMercado,
      }));

    // Top cheapest (where we're cheaper than market)
    const topCheaper = [...comparisons]
      .filter(c => c.diffPercent < 0)
      .sort((a, b) => a.diffPercent - b.diffPercent)
      .slice(0, 8)
      .map(c => ({
        name: c.descricao.length > 30 ? c.descricao.slice(0, 28) + '…' : c.descricao,
        fullName: c.descricao,
        diff: Math.round(c.diffPercent),
        nosso: c.precoEfetivo,
        mercado: c.minMercado,
      }));

    // Source count
    const sourceCounts: Record<string, number> = {};
    for (const row of allMarketPrices) {
      const fonte = row.fonte === 'Outro' ? 'Outros' : row.fonte;
      sourceCounts[fonte] = (sourceCounts[fonte] || 0) + 1;
    }
    const sourceData = Object.entries(sourceCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return {
      totalWithPrice,
      cheaper: cheaper.length,
      moreExpensive: moreExpensive.length,
      similar: similar.length,
      avgDiff,
      distribution,
      topExpensive,
      topCheaper,
      sourceData,
    };
  }, [allMarketPrices, productsWithSnapshot]);

  if (analysis.totalWithPrice === 0) return null;

  const pieConfig = {
    'Mais barato': { label: 'Mais barato', color: 'hsl(142 71% 45%)' },
    'Similar': { label: 'Similar', color: 'hsl(var(--chart-4))' },
    'Mais caro': { label: 'Mais caro', color: 'hsl(var(--chart-1))' },
  };

  const barConfig = {
    diff: { label: 'Diferença %', color: 'hsl(var(--chart-1))' },
  };

  const barCheaperConfig = {
    diff: { label: 'Diferença %', color: 'hsl(142 71% 45%)' },
  };

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <ShoppingCart className="h-3.5 w-3.5" />
              Produtos Comparados
            </div>
            <p className="text-2xl font-bold">{analysis.totalWithPrice}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <BarChart3 className="h-3.5 w-3.5" />
              Diferença Média
            </div>
            <p className={`text-2xl font-bold ${analysis.avgDiff > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {analysis.avgDiff > 0 ? '+' : ''}{analysis.avgDiff.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-green-600 text-xs font-medium mb-1">
              <TrendingDown className="h-3.5 w-3.5" />
              Mais Baratos
            </div>
            <p className="text-2xl font-bold text-green-600">{analysis.cheaper}</p>
            <p className="text-[10px] text-muted-foreground">abaixo do mercado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-red-600 text-xs font-medium mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Mais Caros
            </div>
            <p className="text-2xl font-bold text-red-600">{analysis.moreExpensive}</p>
            <p className="text-[10px] text-muted-foreground">acima do mercado</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pie: Distribution */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium">Posicionamento vs Mercado</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ChartContainer config={pieConfig} className="h-[200px] w-full">
              <PieChart>
                <Pie
                  data={analysis.distribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                >
                  {analysis.distribution.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
            <div className="flex justify-center gap-4 mt-2">
              {analysis.distribution.map(d => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
                  <span className="text-muted-foreground">{d.name}</span>
                  <span className="font-semibold">{d.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Bar: Where we're most expensive */}
        {analysis.topExpensive.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-red-600">
                Produtos Mais Caros que o Mercado
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ChartContainer config={barConfig} className="h-[200px] w-full">
                <BarChart data={analysis.topExpensive} layout="vertical" margin={{ left: 8, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `+${v}%`} />
                  <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl space-y-1">
                          <p className="font-medium">{d.fullName}</p>
                          <p>Nosso: <strong>{formatCurrency(d.nosso)}</strong></p>
                          <p>Mercado (min): <strong>{formatCurrency(d.mercado)}</strong></p>
                          <p className="text-red-600 font-semibold">+{d.diff}% mais caro</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="diff" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Second row: where we're cheaper */}
      {analysis.topCheaper.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-green-600">
              Produtos Mais Baratos que o Mercado
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ChartContainer config={barCheaperConfig} className="h-[200px] w-full">
              <BarChart data={analysis.topCheaper} layout="vertical" margin={{ left: 8, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl space-y-1">
                        <p className="font-medium">{d.fullName}</p>
                        <p>Nosso: <strong>{formatCurrency(d.nosso)}</strong></p>
                        <p>Mercado (min): <strong>{formatCurrency(d.mercado)}</strong></p>
                        <p className="text-green-600 font-semibold">{d.diff}% mais barato</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="diff" fill="hsl(142 71% 45%)" radius={[4, 0, 0, 4]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
