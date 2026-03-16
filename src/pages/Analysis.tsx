import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie, Legend, LineChart, Line, AreaChart, Area } from 'recharts';
import { useInventory } from '@/store/InventoryContext';
import { formatCurrency, formatNumber, AGING_CATEGORIES } from '@/types/inventory';
import { AgingBadge } from '@/components/AgingBadge';
import { KPICard } from '@/components/KPICard';
import { AlertTriangle, TrendingDown, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const AGING_COLORS = ['#16a34a', '#6b7280', '#d97706', '#ea580c', '#dc2626', '#94a3b8'];

export default function Analysis() {
  const { produtos, getLatestProdutoSnapshots, snapshots, produtoSnapshots } = useInventory();
  const latest = getLatestProdutoSnapshots();
  const isEmpty = latest.length === 0;

  const [grupoFilter, setGrupoFilter] = useState('all');
  const [marcaFilter, setMarcaFilter] = useState('all');

  const grupos = useMemo(() => [...new Set(produtos.map(p => p.grupo).filter(Boolean))].sort(), [produtos]);
  const marcas = useMemo(() => [...new Set(produtos.map(p => p.marca).filter(Boolean))].sort(), [produtos]);

  // Filtered data
  const filteredLatest = useMemo(() => {
    let result = latest;
    if (grupoFilter !== 'all') {
      const ids = new Set(produtos.filter(p => p.grupo === grupoFilter).map(p => p.id));
      result = result.filter(ps => ids.has(ps.produto_id));
    }
    if (marcaFilter !== 'all') {
      const ids = new Set(produtos.filter(p => p.marca === marcaFilter).map(p => p.id));
      result = result.filter(ps => ids.has(ps.produto_id));
    }
    return result;
  }, [latest, produtos, grupoFilter, marcaFilter]);

  // Summary KPIs for filtered data
  const summaryKPIs = useMemo(() => {
    const total = filteredLatest.reduce((s, p) => s + p.valor_total, 0);
    const qtd = filteredLatest.length;
    const parado = filteredLatest.filter(p => p.dias_sem_venda > 180 || p.dias_sem_venda < 0);
    const valorParado = parado.reduce((s, p) => s + p.valor_total, 0);
    const comVenda = filteredLatest.filter(p => p.dias_sem_venda >= 0);
    const mediaDias = comVenda.length > 0 ? comVenda.reduce((s, p) => s + p.dias_sem_venda, 0) / comVenda.length : 0;
    return { total, qtd, valorParado, pctParado: total > 0 ? (valorParado / total) * 100 : 0, mediaDias };
  }, [filteredLatest]);

  const agingByValue = useMemo(() => {
    return AGING_CATEGORIES.map((cat, i) => {
      const items = filteredLatest.filter(p => p.categoria_estoque === cat.key);
      return {
        name: cat.label,
        valor: items.reduce((s, p) => s + p.valor_total, 0),
        count: items.length,
        color: AGING_COLORS[i],
      };
    });
  }, [filteredLatest]);

  // Curva ABC
  const curvaABC = useMemo(() => {
    const sorted = [...filteredLatest].sort((a, b) => b.valor_total - a.valor_total);
    const totalValor = sorted.reduce((s, p) => s + p.valor_total, 0);
    let acumulado = 0;
    const data: { pctSKUs: number; pctValor: number }[] = [];
    sorted.forEach((item, i) => {
      acumulado += item.valor_total;
      // Sample points to avoid too many data points
      if (sorted.length <= 100 || i % Math.max(1, Math.floor(sorted.length / 100)) === 0 || i === sorted.length - 1) {
        data.push({
          pctSKUs: Math.round(((i + 1) / sorted.length) * 100),
          pctValor: totalValor > 0 ? Math.round((acumulado / totalValor) * 100) : 0,
        });
      }
    });
    return data;
  }, [filteredLatest]);

  // Breakdown por grupo (stacked aging)
  const grupoBreakdown = useMemo(() => {
    const grupoMap = new Map<string, Record<string, number>>();
    filteredLatest.forEach(ps => {
      const produto = produtos.find(p => p.id === ps.produto_id);
      const grupo = produto?.grupo || 'Sem grupo';
      if (!grupoMap.has(grupo)) {
        grupoMap.set(grupo, {});
      }
      const entry = grupoMap.get(grupo)!;
      const catLabel = AGING_CATEGORIES.find(c => c.key === ps.categoria_estoque)?.label || 'Outro';
      entry[catLabel] = (entry[catLabel] || 0) + ps.valor_total;
    });

    return [...grupoMap.entries()]
      .map(([name, cats]) => ({
        name: name.length > 15 ? name.substring(0, 15) + '…' : name,
        ...cats,
        total: Object.values(cats).reduce((s, v) => s + v, 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [filteredLatest, produtos]);

  // Top parados
  const topParados = useMemo(() => {
    return [...filteredLatest]
      .filter(p => p.dias_sem_venda > 180 || p.dias_sem_venda < 0)
      .sort((a, b) => b.valor_total - a.valor_total)
      .slice(0, 10)
      .map(ps => {
        const produto = produtos.find(p => p.id === ps.produto_id);
        return { ...ps, produto };
      });
  }, [filteredLatest, produtos]);

  // Marca breakdown
  const marcaBreakdown = useMemo(() => {
    const marcaMap = new Map<string, { valor: number; qtd: number; valorParado: number }>();
    filteredLatest.forEach(ps => {
      const produto = produtos.find(p => p.id === ps.produto_id);
      const marca = produto?.marca || 'Sem marca';
      const cur = marcaMap.get(marca) || { valor: 0, qtd: 0, valorParado: 0 };
      cur.valor += ps.valor_total;
      cur.qtd++;
      if (ps.dias_sem_venda > 180 || ps.dias_sem_venda < 0) cur.valorParado += ps.valor_total;
      marcaMap.set(marca, cur);
    });
    return [...marcaMap.entries()]
      .map(([name, data]) => ({
        name: name.length > 12 ? name.substring(0, 12) + '…' : name,
        ...data,
        pctParado: data.valor > 0 ? (data.valorParado / data.valor) * 100 : 0,
      }))
      .sort((a, b) => b.valorParado - a.valorParado)
      .slice(0, 8);
  }, [filteredLatest, produtos]);

  const criticalAlerts = useMemo(() => {
    const critical365 = filteredLatest.filter(p => p.dias_sem_venda > 365 && p.valor_total > 1000);
    const highValueLowTurn = filteredLatest.filter(p => p.dias_sem_venda > 180 && p.valor_total > 5000);
    return { critical365: critical365.length, highValueLowTurn: highValueLowTurn.length };
  }, [filteredLatest]);

  const isFiltered = grupoFilter !== 'all' || marcaFilter !== 'all';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-foreground tracking-tight">Análises</h1>
        {!isEmpty && (
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={grupoFilter} onValueChange={setGrupoFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Grupo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os grupos</SelectItem>
                {grupos.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={marcaFilter} onValueChange={setMarcaFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Marca" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as marcas</SelectItem>
                {marcas.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isEmpty ? (
        <div className="bg-card rounded-xl shadow-card p-12 text-center">
          <p className="text-sm text-muted-foreground">Importe um relatório para visualizar análises.</p>
        </div>
      ) : (
        <>
          {/* Summary KPIs when filtered */}
          {isFiltered && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPICard title="Produtos (filtro)" value={formatNumber(summaryKPIs.qtd)} />
              <KPICard title="Valor Total (filtro)" value={formatCurrency(summaryKPIs.total)} />
              <KPICard title="Valor Parado >180d" value={formatCurrency(summaryKPIs.valorParado)} valueClassName="text-aging-warning" />
              <KPICard title="Média Dias s/ Venda" value={`${Math.round(summaryKPIs.mediaDias)}d`} />
            </div>
          )}

          {/* Alerts */}
          {(criticalAlerts.critical365 > 0 || criticalAlerts.highValueLowTurn > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {criticalAlerts.critical365 > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-aging-critical rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-aging-critical shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-aging-critical">{criticalAlerts.critical365} produtos críticos</p>
                    <p className="text-xs text-aging-critical/80">Sem venda há mais de 365 dias com valor acima de R$ 1.000</p>
                  </div>
                </motion.div>
              )}
              {criticalAlerts.highValueLowTurn > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-aging-warning rounded-xl p-4 flex items-start gap-3">
                  <TrendingDown className="h-5 w-5 text-aging-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-aging-warning">{criticalAlerts.highValueLowTurn} itens alto valor + baixo giro</p>
                    <p className="text-xs text-aging-warning/80">Mais de 180 dias sem venda e valor acima de R$ 5.000</p>
                  </div>
                </motion.div>
              )}
            </div>
          )}

          {/* Row 1: Value by aging + Curva ABC */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl shadow-card p-5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Valor por Categoria de Aging</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={agingByValue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(215 16% 47%)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="valor" name="Valor" radius={[4, 4, 0, 0]}>
                    {agingByValue.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card rounded-xl shadow-card p-5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Curva ABC — Concentração de Valor</p>
              <p className="text-[10px] text-muted-foreground mb-3">Quanto menor a área, mais concentrado o valor em poucos SKUs</p>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={curvaABC}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                  <XAxis dataKey="pctSKUs" tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" tickFormatter={(v) => `${v}%`} label={{ value: '% SKUs', position: 'insideBottom', offset: -5, fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" tickFormatter={(v) => `${v}%`} label={{ value: '% Valor', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `${v}%`} labelFormatter={(l) => `${l}% dos SKUs`} />
                  <Area type="monotone" dataKey="pctValor" stroke="hsl(222 47% 11%)" fill="hsl(222 47% 11% / 0.1)" name="% Valor Acumulado" />
                  {/* Reference line for perfect equality */}
                  <Line type="linear" dataKey="pctSKUs" stroke="hsl(215 16% 47% / 0.3)" strokeDasharray="4 4" dot={false} name="Igualdade" />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          </div>

          {/* Row 2: Breakdown por grupo + marca */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl shadow-card p-5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Top Grupos — Valor por Aging</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={grupoBreakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(215 16% 47%)" width={100} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  {AGING_CATEGORIES.filter((_, i) => i < 5).map((cat, i) => (
                    <Bar key={cat.key} dataKey={cat.label} stackId="a" fill={AGING_COLORS[i]} name={cat.label} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card rounded-xl shadow-card p-5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Top Marcas — Valor Parado vs Total</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={marcaBreakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(215 16% 47%)" width={90} />
                  <Tooltip formatter={(v: number, name: string) => name === 'pctParado' ? `${(v as number).toFixed(1)}%` : formatCurrency(v)} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="valor" name="Valor Total" fill="hsl(222 47% 11% / 0.2)" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="valorParado" name="Valor Parado" fill="hsl(0 72% 51%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          </div>

          {/* Top stagnant products */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl shadow-card overflow-hidden">
            <div className="p-5 pb-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Top 10 — Maior Valor Parado (&gt;180 dias)</p>
            </div>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Código</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Descrição</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Grupo</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Valor</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Dias</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {topParados.map(item => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs">{item.produto?.codigo}</td>
                      <td className="px-4 py-2.5 max-w-[250px] truncate">{item.produto?.descricao}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{item.produto?.grupo}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(item.valor_total)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{item.dias_sem_venda < 0 ? '—' : item.dias_sem_venda}</td>
                      <td className="px-4 py-2.5 text-center"><AgingBadge dias={item.dias_sem_venda} /></td>
                    </tr>
                  ))}
                  {topParados.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground text-xs">Nenhum produto parado acima de 180 dias</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
