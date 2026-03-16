import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie, Legend } from 'recharts';
import { useInventory } from '@/store/InventoryContext';
import { formatCurrency, formatNumber, AGING_CATEGORIES } from '@/types/inventory';
import { AlertTriangle, TrendingDown } from 'lucide-react';

const AGING_COLORS = ['#16a34a', '#6b7280', '#d97706', '#ea580c', '#dc2626'];

export default function Analysis() {
  const { produtos, getLatestProdutoSnapshots, snapshots, produtoSnapshots } = useInventory();
  const latest = getLatestProdutoSnapshots();
  const isEmpty = latest.length === 0;

  const agingByValue = useMemo(() => {
    return AGING_CATEGORIES.map((cat, i) => {
      const items = latest.filter(p => p.categoria_estoque === cat.key);
      return {
        name: cat.label,
        valor: items.reduce((s, p) => s + p.valor_total, 0),
        count: items.length,
        color: AGING_COLORS[i],
      };
    });
  }, [latest]);

  const topParados = useMemo(() => {
    return [...latest]
      .filter(p => p.dias_sem_venda > 180)
      .sort((a, b) => b.valor_total - a.valor_total)
      .slice(0, 10)
      .map(ps => {
        const produto = produtos.find(p => p.id === ps.produto_id);
        return { ...ps, produto };
      });
  }, [latest, produtos]);

  const criticalAlerts = useMemo(() => {
    const critical365 = latest.filter(p => p.dias_sem_venda > 365 && p.valor_total > 1000);
    const highValueLowTurn = latest.filter(p => p.dias_sem_venda > 180 && p.valor_total > 5000);
    return { critical365: critical365.length, highValueLowTurn: highValueLowTurn.length };
  }, [latest]);

  const evolutionData = useMemo(() => {
    return snapshots.map(snap => {
      const items = produtoSnapshots.filter(ps => ps.snapshot_id === snap.id);
      const byCategory: Record<string, number> = {};
      AGING_CATEGORIES.forEach(c => {
        byCategory[c.label] = items.filter(i => i.categoria_estoque === c.key).reduce((s, i) => s + i.valor_total, 0);
      });
      return { data: new Date(snap.data_importacao).toLocaleDateString('pt-BR'), ...byCategory };
    });
  }, [snapshots, produtoSnapshots]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-foreground tracking-tight">Análises</h1>

      {isEmpty ? (
        <div className="bg-card rounded-xl shadow-card p-12 text-center">
          <p className="text-sm text-muted-foreground">Importe um relatório para visualizar análises.</p>
        </div>
      ) : (
        <>
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

          {/* Value by aging */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl shadow-card p-5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Valor por Categoria de Aging</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={agingByValue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
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
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Distribuição por Quantidade</p>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={agingByValue} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} strokeWidth={2} stroke="hsl(0 0% 100%)">
                    {agingByValue.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </motion.div>
          </div>

          {/* Top stagnant products */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl shadow-card overflow-hidden">
            <div className="p-5 pb-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Top 10 — Maior Valor Parado (&gt;180 dias)</p>
            </div>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Código</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Descrição</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Valor</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Dias</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {topParados.map(item => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs">{item.produto?.codigo}</td>
                      <td className="px-4 py-2.5 max-w-[300px] truncate">{item.produto?.descricao}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(item.valor_total)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{item.dias_sem_venda >= 9999 ? '—' : item.dias_sem_venda}</td>
                      <td className="px-4 py-2.5 text-center"><AgingBadge dias={item.dias_sem_venda} /></td>
                    </tr>
                  ))}
                  {topParados.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-xs">Nenhum produto parado acima de 180 dias</td></tr>
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
