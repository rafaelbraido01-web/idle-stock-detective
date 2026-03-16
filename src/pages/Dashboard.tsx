import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid, Cell, PieChart, Pie, Legend } from 'recharts';
import { useInventory } from '@/store/InventoryContext';
import { KPICard } from '@/components/KPICard';
import { formatCurrency, formatNumber, AGING_CATEGORIES } from '@/types/inventory';
import { TrendingDown, AlertTriangle, Package, DollarSign, BarChart3, Layers } from 'lucide-react';

const AGING_COLORS = ['#16a34a', '#6b7280', '#d97706', '#ea580c', '#dc2626', '#94a3b8'];

export default function Dashboard() {
  const { snapshots, produtoSnapshots, getLatestProdutoSnapshots, produtos } = useInventory();
  const latest = getLatestProdutoSnapshots();

  const kpis = useMemo(() => {
    const valorTotal = latest.reduce((s, p) => s + p.valor_total, 0);
    const totalSKUs = latest.length;
    const ticketMedio = totalSKUs > 0 ? valorTotal / totalSKUs : 0;

    const parados180 = latest.filter(p => p.dias_sem_venda > 180 || p.dias_sem_venda < 0);
    const parados365 = latest.filter(p => p.dias_sem_venda > 365 || p.dias_sem_venda < 0);
    const semRegistro = latest.filter(p => p.dias_sem_venda < 0);
    const valorParado180 = parados180.reduce((s, p) => s + p.valor_total, 0);
    const valorParado365 = parados365.reduce((s, p) => s + p.valor_total, 0);
    const pctParado = valorTotal > 0 ? (valorParado180 / valorTotal) * 100 : 0;

    // Média ponderada de dias sem venda (exclui sem-registro)
    const comVenda = latest.filter(p => p.dias_sem_venda >= 0);
    const mediaDias = comVenda.length > 0
      ? comVenda.reduce((s, p) => s + p.dias_sem_venda, 0) / comVenda.length
      : 0;

    // Pareto: quantos % dos SKUs representam 80% do valor
    const sorted = [...latest].sort((a, b) => b.valor_total - a.valor_total);
    let acumulado = 0;
    let skusPareto = 0;
    const target80 = valorTotal * 0.8;
    for (const item of sorted) {
      acumulado += item.valor_total;
      skusPareto++;
      if (acumulado >= target80) break;
    }
    const pctPareto = totalSKUs > 0 ? (skusPareto / totalSKUs) * 100 : 0;

    return {
      valorTotal, valorParado180, valorParado365, pctParado,
      qtd180: parados180.length, qtd365: parados365.length,
      totalSKUs, ticketMedio, mediaDias, pctPareto, skusPareto,
      semRegistro: semRegistro.length,
    };
  }, [latest]);

  const agingDistribution = useMemo(() => {
    return AGING_CATEGORIES.map((cat, i) => {
      const items = latest.filter(p => p.categoria_estoque === cat.key);
      return {
        name: cat.label,
        quantidade: items.length,
        valor: items.reduce((s, p) => s + p.valor_total, 0),
        color: AGING_COLORS[i],
      };
    });
  }, [latest]);

  // Top 5 grupos com mais estoque parado (>180d)
  const topGruposParados = useMemo(() => {
    const grupoMap = new Map<string, { valor: number; qtd: number }>();
    latest
      .filter(p => p.dias_sem_venda > 180 || p.dias_sem_venda < 0)
      .forEach(ps => {
        const produto = produtos.find(p => p.id === ps.produto_id);
        const grupo = produto?.grupo || 'Sem grupo';
        const cur = grupoMap.get(grupo) || { valor: 0, qtd: 0 };
        cur.valor += ps.valor_total;
        cur.qtd++;
        grupoMap.set(grupo, cur);
      });
    return [...grupoMap.entries()]
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 7);
  }, [latest, produtos]);

  const evolutionData = useMemo(() => {
    return snapshots.map(snap => {
      const items = produtoSnapshots.filter(ps => ps.snapshot_id === snap.id);
      const total = items.reduce((s, p) => s + p.valor_total, 0);
      const parado = items.filter(p => p.dias_sem_venda > 180 || p.dias_sem_venda < 0).reduce((s, p) => s + p.valor_total, 0);
      const saudavel = items.filter(p => p.dias_sem_venda >= 0 && p.dias_sem_venda <= 90).reduce((s, p) => s + p.valor_total, 0);
      return {
        data: new Date(snap.data_importacao).toLocaleDateString('pt-BR'),
        total,
        parado,
        saudavel,
      };
    });
  }, [snapshots, produtoSnapshots]);

  // Distribuição por valor (pie)
  const agingByValue = useMemo(() => {
    return AGING_CATEGORIES.map((cat, i) => {
      const items = latest.filter(p => p.categoria_estoque === cat.key);
      return {
        name: cat.label,
        value: items.reduce((s, p) => s + p.valor_total, 0),
        color: AGING_COLORS[i],
      };
    }).filter(d => d.value > 0);
  }, [latest]);

  const isEmpty = latest.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground tracking-tight">Dashboard</h1>
        {!isEmpty && (
          <p className="text-sm text-muted-foreground mt-1">
            {formatNumber(latest.length)} produtos · Última importação: {new Date(snapshots[snapshots.length - 1]?.data_importacao).toLocaleString('pt-BR')}
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
          {/* Row 1: KPIs principais */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              title="Valor Total em Estoque"
              value={formatCurrency(kpis.valorTotal)}
              subtitle={`${formatNumber(kpis.totalSKUs)} SKUs`}
            />
            <KPICard
              title="Estoque Parado (>180d)"
              value={formatCurrency(kpis.valorParado180)}
              subtitle={`${kpis.pctParado.toFixed(1)}% do total · ${formatNumber(kpis.qtd180)} itens`}
              valueClassName="text-aging-warning"
            />
            <KPICard
              title="Estoque Crítico (>365d)"
              value={formatCurrency(kpis.valorParado365)}
              subtitle={`${formatNumber(kpis.qtd365)} itens`}
              valueClassName="text-aging-critical"
            />
            <KPICard
              title="Média Dias sem Venda"
              value={`${Math.round(kpis.mediaDias)} dias`}
              subtitle={kpis.semRegistro > 0 ? `${formatNumber(kpis.semRegistro)} sem registro de venda` : undefined}
            />
          </div>

          {/* Row 2: KPIs secundários */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              title="Ticket Médio por SKU"
              value={formatCurrency(kpis.ticketMedio)}
              subtitle="Valor médio em estoque por produto"
            />
            <KPICard
              title="Concentração (Pareto)"
              value={`${kpis.pctPareto.toFixed(0)}% dos SKUs`}
              subtitle={`${formatNumber(kpis.skusPareto)} SKUs = 80% do valor`}
            />
            <KPICard
              title="Estoque Saudável (0-90d)"
              value={formatNumber(agingDistribution[0]?.quantidade || 0)}
              subtitle={formatCurrency(agingDistribution[0]?.valor || 0)}
              valueClassName="text-aging-healthy"
            />
            <KPICard
              title="Importações Realizadas"
              value={String(snapshots.length)}
              subtitle={snapshots.length > 1 ? 'Compare a evolução abaixo' : 'Importe mais para ver evolução'}
            />
          </div>

          {/* Row 3: Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Aging por quantidade */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-card rounded-xl shadow-card p-5"
            >
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Distribuição por Aging (Quantidade)</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={agingDistribution} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" width={80} />
                  <Tooltip />
                  <Bar dataKey="quantidade" name="Produtos" radius={[0, 4, 4, 0]}>
                    {agingDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Aging por valor (pie) */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-card rounded-xl shadow-card p-5"
            >
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Distribuição por Aging (Valor R$)</p>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={agingByValue}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={85}
                    innerRadius={50}
                    strokeWidth={2}
                    stroke="hsl(0 0% 100%)"
                  >
                    {agingByValue.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
            </motion.div>
          </div>

          {/* Row 4: Grupos parados + Evolução */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top grupos com estoque parado */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-card rounded-xl shadow-card p-5"
            >
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Top Grupos — Maior Estoque Parado</p>
              {topGruposParados.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={topGruposParados} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(215 16% 47%)" width={100} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="valor" name="Valor Parado" radius={[0, 4, 4, 0]} fill="hsl(0 72% 51%)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[240px] flex items-center justify-center">
                  <p className="text-xs text-muted-foreground">Nenhum produto parado acima de 180 dias</p>
                </div>
              )}
            </motion.div>

            {/* Evolução do estoque */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="bg-card rounded-xl shadow-card p-5"
            >
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Evolução do Estoque</p>
              {evolutionData.length > 1 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={evolutionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                    <XAxis dataKey="data" tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Area type="monotone" dataKey="total" stroke="hsl(222 47% 11%)" fill="hsl(222 47% 11% / 0.08)" name="Total" />
                    <Area type="monotone" dataKey="saudavel" stroke="hsl(160 60% 36%)" fill="hsl(160 60% 36% / 0.08)" name="Saudável" />
                    <Area type="monotone" dataKey="parado" stroke="hsl(0 72% 51%)" fill="hsl(0 72% 51% / 0.08)" name="Parado (>180d)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[240px] flex items-center justify-center border border-dashed rounded-lg">
                  <p className="text-xs text-muted-foreground">Importe mais relatórios para ver a evolução</p>
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}
