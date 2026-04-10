import { useMemo } from 'react';
import { formatCurrency } from '@/types/inventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { TrendingDown, TrendingUp, BarChart3, ShoppingCart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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

export type ChartFilter =
  | { type: 'category'; value: 'much_cheaper' | 'cheaper' | 'more_expensive' | 'much_expensive' }
  | { type: 'product'; codigo: string }
  | null;

interface Props {
  allMarketPrices: MarketPriceRow[];
  productsWithSnapshot: ProductWithSnap[];
  activeFilter?: ChartFilter;
  onFilterChange?: (filter: ChartFilter) => void;
}

export default function MarketPriceAnalytics({ allMarketPrices, productsWithSnapshot, activeFilter, onFilterChange }: Props) {
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
    const muchCheaper = comparisons.filter(c => c.diffPercent < -5);
    const cheaper = comparisons.filter(c => c.diffPercent >= -5 && c.diffPercent < 0);
    const moreExpensive = comparisons.filter(c => c.diffPercent >= 0 && c.diffPercent <= 5);
    const muchExpensive = comparisons.filter(c => c.diffPercent > 5);
    const avgDiff = totalWithPrice > 0 
      ? comparisons.reduce((sum, c) => sum + c.diffPercent, 0) / totalWithPrice 
      : 0;

    // Distribution for pie chart
    const distribution = [
      { name: 'Mais barato >5%', value: muchCheaper.length, color: '#15803d', category: 'much_cheaper' as const },
      { name: 'Mais barato 0-5%', value: cheaper.length, color: '#86efac', category: 'cheaper' as const },
      { name: 'Mais caro 0-5%', value: moreExpensive.length, color: '#fca5a5', category: 'more_expensive' as const },
      { name: 'Mais caro >5%', value: muchExpensive.length, color: '#dc2626', category: 'much_expensive' as const },
    ].filter(d => d.value > 0);

    // Top 10 most expensive vs market (where we're pricier)
    const topExpensive = [...comparisons]
      .filter(c => c.diffPercent > 0)
      .sort((a, b) => b.diffPercent - a.diffPercent)
      .slice(0, 8)
      .map(c => ({
        codigo: c.codigo,
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
        codigo: c.codigo,
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
      muchCheaper: muchCheaper.length,
      cheaper: cheaper.length,
      moreExpensive: moreExpensive.length,
      muchExpensive: muchExpensive.length,
      avgDiff,
      distribution,
      topExpensive,
      topCheaper,
      sourceData,
    };
  }, [allMarketPrices, productsWithSnapshot]);

  if (analysis.totalWithPrice === 0) return null;

  const handlePieClick = (category: 'much_cheaper' | 'cheaper' | 'more_expensive' | 'much_expensive') => {
    if (!onFilterChange) return;
    if (activeFilter?.type === 'category' && activeFilter.value === category) {
      onFilterChange(null);
    } else {
      onFilterChange({ type: 'category', value: category });
    }
  };

  const handleBarClick = (codigo: string) => {
    if (!onFilterChange) return;
    if (activeFilter?.type === 'product' && activeFilter.codigo === codigo) {
      onFilterChange(null);
    } else {
      onFilterChange({ type: 'product', codigo });
    }
  };

  const isFilterActive = !!activeFilter;

  const pieConfig = {
    'Mais barato >5%': { label: 'Mais barato >5%', color: '#15803d' },
    'Mais barato 0-5%': { label: 'Mais barato 0-5%', color: '#86efac' },
    'Mais caro 0-5%': { label: 'Mais caro 0-5%', color: '#fca5a5' },
    'Mais caro >5%': { label: 'Mais caro >5%', color: '#dc2626' },
  };

  const barConfig = {
    diff: { label: 'Diferença %', color: 'hsl(var(--chart-1))' },
  };

  const barCheaperConfig = {
    diff: { label: 'Diferença %', color: 'hsl(142 71% 45%)' },
  };

  return (
    <div className="space-y-4">
      {/* Active filter badge */}
      {isFilterActive && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 cursor-pointer" onClick={() => onFilterChange?.(null)}>
           Filtro ativo: {activeFilter.type === 'category'
              ? activeFilter.value === 'much_cheaper' ? 'Mais barato >5%'
                : activeFilter.value === 'cheaper' ? 'Mais barato 0-5%'
                : activeFilter.value === 'more_expensive' ? 'Mais caro 0-5%'
                : 'Mais caro >5%'
              : `Produto ${activeFilter.codigo}`
            }
            <span className="ml-1 text-muted-foreground">✕</span>
          </Badge>
        </div>
      )}

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
        <Card
          className={`cursor-pointer transition-all hover:ring-2 hover:ring-green-400 ${activeFilter?.type === 'category' && (activeFilter.value === 'much_cheaper' || activeFilter.value === 'cheaper') ? 'ring-2 ring-green-500' : ''}`}
          onClick={() => handlePieClick('much_cheaper')}
        >
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-green-600 text-xs font-medium mb-1">
              <TrendingDown className="h-3.5 w-3.5" />
              Mais Baratos
            </div>
            <p className="text-2xl font-bold text-green-600">{analysis.muchCheaper + analysis.cheaper}</p>
            <p className="text-[10px] text-muted-foreground">abaixo do mercado</p>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-all hover:ring-2 hover:ring-red-400 ${activeFilter?.type === 'category' && (activeFilter.value === 'more_expensive' || activeFilter.value === 'much_expensive') ? 'ring-2 ring-red-500' : ''}`}
          onClick={() => handlePieClick('much_expensive')}
        >
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-red-600 text-xs font-medium mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Mais Caros
            </div>
            <p className="text-2xl font-bold text-red-600">{analysis.moreExpensive + analysis.muchExpensive}</p>
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
                  className="cursor-pointer"
                  onClick={(_: any, idx: number) => {
                    const entry = analysis.distribution[idx];
                    if (entry) handlePieClick(entry.category);
                  }}
                >
                  {analysis.distribution.map((entry, idx) => {
                    const isSelected = activeFilter?.type === 'category' && activeFilter.value === entry.category;
                    const isOtherSelected = activeFilter?.type === 'category' && activeFilter.value !== entry.category;
                    return (
                      <Cell
                        key={idx}
                        fill={entry.color}
                        opacity={isOtherSelected ? 0.3 : 1}
                        stroke={isSelected ? entry.color : 'none'}
                        strokeWidth={isSelected ? 3 : 0}
                      />
                    );
                  })}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
            <div className="flex justify-center gap-4 mt-2">
              {analysis.distribution.map(d => {
                const isSelected = activeFilter?.type === 'category' && activeFilter.value === d.category;
                return (
                  <div
                    key={d.name}
                    className={`flex items-center gap-1.5 text-xs cursor-pointer rounded px-1.5 py-0.5 transition-colors ${isSelected ? 'bg-muted' : 'hover:bg-muted/50'}`}
                    onClick={() => handlePieClick(d.category)}
                  >
                    <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
                    <span className="text-muted-foreground">{d.name}</span>
                    <span className="font-semibold">{d.value}</span>
                    <span className="text-muted-foreground">({(d.value / analysis.totalWithPrice * 100).toFixed(0)}%)</span>
                  </div>
                );
              })}
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
                  <Bar dataKey="diff" radius={[0, 4, 4, 0]} className="cursor-pointer" onClick={(data: any) => handleBarClick(data.codigo)}>
                    {analysis.topExpensive.map((entry, idx) => {
                      const maxDiff = analysis.topExpensive[0]?.diff || 1;
                      const t = maxDiff > 0 ? entry.diff / maxDiff : 0;
                      const r = Math.round(114 + (239 - 114) * t);
                      const g = Math.round(27 + (68 - 27) * t);
                      const b = Math.round(45 + (68 - 45) * t);
                      const isSelected = activeFilter?.type === 'product' && activeFilter.codigo === entry.codigo;
                      return <Cell key={idx} fill={`rgb(${r},${g},${b})`} opacity={isSelected ? 1 : (activeFilter?.type === 'product' ? 0.4 : 1)} stroke={isSelected ? '#000' : 'none'} strokeWidth={isSelected ? 2 : 0} />;
                    })}
                  </Bar>
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
                <YAxis type="category" dataKey="name" width={0} tick={false} />
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
                <Bar dataKey="diff" fill="hsl(142 71% 45%)" radius={[4, 0, 0, 4]} className="cursor-pointer" onClick={(data: any) => handleBarClick(data.codigo)}>
                  {analysis.topCheaper.map((entry, idx) => {
                    const isSelected = activeFilter?.type === 'product' && activeFilter.codigo === entry.codigo;
                    return <Cell key={idx} fill="hsl(142 71% 45%)" opacity={isSelected ? 1 : (activeFilter?.type === 'product' ? 0.4 : 1)} stroke={isSelected ? '#000' : 'none'} strokeWidth={isSelected ? 2 : 0} />;
                  })}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
