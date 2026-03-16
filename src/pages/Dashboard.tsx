import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { useInventory } from '@/store/InventoryContext';
import { KPICard } from '@/components/KPICard';
import { formatCurrency, formatNumber, AGING_CATEGORIES } from '@/types/inventory';

const AGING_COLORS = ['#16a34a', '#6b7280', '#d97706', '#ea580c', '#dc2626'];

export default function Dashboard() {
  const { snapshots, produtoSnapshots, getLatestProdutoSnapshots } = useInventory();
  const latest = getLatestProdutoSnapshots();

  const kpis = useMemo(() => {
    const valorTotal = latest.reduce((s, p) => s + p.valor_total, 0);
    const parados180 = latest.filter(p => p.dias_sem_venda > 180);
    const parados365 = latest.filter(p => p.dias_sem_venda > 365);
    const valorParado = parados180.reduce((s, p) => s + p.valor_total, 0);
    const pctParado = valorTotal > 0 ? (valorParado / valorTotal) * 100 : 0;

    return { valorTotal, valorParado, pctParado, qtd180: parados180.length, qtd365: parados365.length };
  }, [latest]);

  const agingDistribution = useMemo(() => {
    return AGING_CATEGORIES.map((cat, i) => ({
      name: cat.label,
      value: latest.filter(p => p.categoria_estoque === cat.key).length,
      color: AGING_COLORS[i],
    }));
  }, [latest]);

  const evolutionData = useMemo(() => {
    return snapshots.map(snap => {
      const items = produtoSnapshots.filter(ps => ps.snapshot_id === snap.id);
      const total = items.reduce((s, p) => s + p.valor_total, 0);
      const parado = items.filter(p => p.dias_sem_venda > 180).reduce((s, p) => s + p.valor_total, 0);
      return {
        data: new Date(snap.data_importacao).toLocaleDateString('pt-BR'),
        total,
        parado,
      };
    });
  }, [snapshots, produtoSnapshots]);

  const isEmpty = latest.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground tracking-tight">Dashboard</h1>
        {!isEmpty && (
          <p className="text-sm text-muted-foreground mt-1">
            {formatNumber(latest.length)} produtos processados · Última importação: {new Date(snapshots[snapshots.length - 1]?.data_importacao).toLocaleString('pt-BR')}
          </p>
        )}
      </div>

      {isEmpty ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-card rounded-xl shadow-card p-12 text-center"
        >
          <p className="text-muted-foreground text-sm">Nenhuma importação realizada.</p>
          <p className="text-muted-foreground text-xs mt-1">Use o botão "Importar Relatório ERP" para começar.</p>
        </motion.div>
      ) : (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KPICard title="Valor Total Estoque" value={formatCurrency(kpis.valorTotal)} />
            <KPICard title="Valor Estoque Parado" value={formatCurrency(kpis.valorParado)} valueClassName="text-aging-warning" />
            <KPICard title="% Estoque Parado" value={`${kpis.pctParado.toFixed(1)}%`} />
            <KPICard title="Sem Venda > 180d" value={formatNumber(kpis.qtd180)} valueClassName="text-aging-warning" />
            <KPICard title="Sem Venda > 365d" value={formatNumber(kpis.qtd365)} valueClassName="text-aging-critical" />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-card rounded-xl shadow-card p-5"
            >
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Evolução do Estoque</p>
              {evolutionData.length > 1 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={evolutionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                    <XAxis dataKey="data" tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Area type="monotone" dataKey="total" stroke="hsl(222 47% 11%)" fill="hsl(222 47% 11% / 0.08)" name="Total" />
                    <Area type="monotone" dataKey="parado" stroke="hsl(0 72% 51%)" fill="hsl(0 72% 51% / 0.08)" name="Parado" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[240px] flex items-center justify-center border border-dashed rounded-lg">
                  <p className="text-xs text-muted-foreground">Importe mais relatórios para ver a evolução</p>
                </div>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-card rounded-xl shadow-card p-5"
            >
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Distribuição por Aging</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={agingDistribution} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" width={70} />
                  <Tooltip />
                  <Bar dataKey="value" name="Produtos" radius={[0, 4, 4, 0]}>
                    {agingDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}
