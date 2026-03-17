import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, AreaChart, Area, Legend, Line } from 'recharts';
import { useInventory } from '@/store/InventoryContext';
import { KPICard } from '@/components/KPICard';
import { AgingBadge } from '@/components/AgingBadge';
import { formatCurrency, formatNumber } from '@/types/inventory';
import { AlertTriangle, TrendingDown, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


export default function Dashboard() {
  const { snapshots, produtoSnapshots, getLatestProdutoSnapshots, produtos } = useInventory();
  const latest = getLatestProdutoSnapshots();
  const isEmpty = latest.length === 0;

  const [grupoFilter, setGrupoFilter] = useState('all');
  const [marcaFilter, setMarcaFilter] = useState('all');

  const grupos = useMemo(() => [...new Set(produtos.map(p => p.grupo).filter(Boolean))].sort(), [produtos]);
  const marcas = useMemo(() => [...new Set(produtos.map(p => p.marca).filter(Boolean))].sort(), [produtos]);

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

  const isFiltered = grupoFilter !== 'all' || marcaFilter !== 'all';

  const kpis = useMemo(() => {
    const data = filteredLatest;
    const valorTotal = data.reduce((s, p) => s + p.valor_total, 0);
    const totalSKUs = data.length;
    const ticketMedio = totalSKUs > 0 ? valorTotal / totalSKUs : 0;

    const parados180 = data.filter(p => p.dias_sem_venda > 180 || p.dias_sem_venda < 0);
    const parados365 = data.filter(p => p.dias_sem_venda > 365 || p.dias_sem_venda < 0);
    const semRegistro = data.filter(p => p.dias_sem_venda < 0);
    const valorParado180 = parados180.reduce((s, p) => s + p.valor_total, 0);
    const valorParado365 = parados365.reduce((s, p) => s + p.valor_total, 0);
    const pctParado = valorTotal > 0 ? (valorParado180 / valorTotal) * 100 : 0;

    const comVenda = data.filter(p => p.dias_sem_venda >= 0);
    const mediaDias = comVenda.length > 0
      ? comVenda.reduce((s, p) => s + p.dias_sem_venda, 0) / comVenda.length
      : 0;

    const sorted = [...data].sort((a, b) => b.valor_total - a.valor_total);
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
  }, [filteredLatest]);

  // Última Compra
  const compraDistribuicao = useMemo(() => {
    const lt30 = filteredLatest.filter(p => p.dias_sem_compra >= 0 && p.dias_sem_compra < 30);
    const d30a90 = filteredLatest.filter(p => p.dias_sem_compra >= 30 && p.dias_sem_compra < 90);
    const d90a180 = filteredLatest.filter(p => p.dias_sem_compra >= 90 && p.dias_sem_compra <= 180);
    const gt180 = filteredLatest.filter(p => p.dias_sem_compra > 180);
    const semRegistro = filteredLatest.filter(p => p.dias_sem_compra < 0);

    return [
      { name: '< 30 dias', qtd: lt30.length, valor: lt30.reduce((s, p) => s + p.valor_total, 0), color: '#059669' },
      { name: '30 a 90 dias', qtd: d30a90.length, valor: d30a90.reduce((s, p) => s + p.valor_total, 0), color: '#16a34a' },
      { name: '90 a 180 dias', qtd: d90a180.length, valor: d90a180.reduce((s, p) => s + p.valor_total, 0), color: '#d97706' },
      { name: '> 180 dias', qtd: gt180.length, valor: gt180.reduce((s, p) => s + p.valor_total, 0), color: '#dc2626' },
      { name: 'Sem registro', qtd: semRegistro.length, valor: semRegistro.reduce((s, p) => s + p.valor_total, 0), color: '#94a3b8' },
    ].filter(d => d.qtd > 0);
  }, [filteredLatest]);




  // Evolução
  const evolutionData = useMemo(() => {
    return snapshots.map(snap => {
      const items = produtoSnapshots.filter(ps => ps.snapshot_id === snap.id);
      const total = items.reduce((s, p) => s + p.valor_total, 0);
      const parado = items.filter(p => p.dias_sem_venda > 180 || p.dias_sem_venda < 0).reduce((s, p) => s + p.valor_total, 0);
      const saudavel = items.filter(p => p.dias_sem_venda >= 0 && p.dias_sem_venda <= 90).reduce((s, p) => s + p.valor_total, 0);
      return {
        data: new Date(snap.data_importacao).toLocaleDateString('pt-BR'),
        total, parado, saudavel,
      };
    });
  }, [snapshots, produtoSnapshots]);




  // Curva ABC
  const curvaABC = useMemo(() => {
    const sorted = [...filteredLatest].sort((a, b) => b.valor_total - a.valor_total);
    const totalValor = sorted.reduce((s, p) => s + p.valor_total, 0);
    let acumulado = 0;
    const data: { pctSKUs: number; pctValor: number }[] = [];
    sorted.forEach((item, i) => {
      acumulado += item.valor_total;
      if (sorted.length <= 100 || i % Math.max(1, Math.floor(sorted.length / 100)) === 0 || i === sorted.length - 1) {
        data.push({
          pctSKUs: Math.round(((i + 1) / sorted.length) * 100),
          pctValor: totalValor > 0 ? Math.round((acumulado / totalValor) * 100) : 0,
        });
      }
    });
    return data;
  }, [filteredLatest]);

  // Alerts
  const criticalAlerts = useMemo(() => {
    const critical365 = filteredLatest.filter(p => p.dias_sem_venda > 365 && p.valor_total > 1000);
    const highValueLowTurn = filteredLatest.filter(p => p.dias_sem_venda > 180 && p.valor_total > 5000);
    return { critical365: critical365.length, highValueLowTurn: highValueLowTurn.length };
  }, [filteredLatest]);

  // Top parados
  const topParados = useMemo(() => {
    return [...filteredLatest]
      .filter(p => p.dias_sem_compra > 180 || p.dias_sem_compra < 0)
      .sort((a, b) => b.valor_total - a.valor_total)
      .slice(0, 10)
      .map(ps => {
        const produto = produtos.find(p => p.id === ps.produto_id);
        return { ...ps, produto };
      });
  }, [filteredLatest, produtos]);

  // Distribuição por custo médio
  const custoDistribuicao = useMemo(() => {
    const ate1k = filteredLatest.filter(p => p.valor_unitario <= 1000);
    const ate10k = filteredLatest.filter(p => p.valor_unitario > 1000 && p.valor_unitario <= 10000);
    const maior10k = filteredLatest.filter(p => p.valor_unitario > 10000);

    return [
      { name: 'Até R$ 1.000', qtd: ate1k.length, valor: ate1k.reduce((s, p) => s + p.valor_total, 0), color: '#16a34a' },
      { name: 'R$ 1k a R$ 10k', qtd: ate10k.length, valor: ate10k.reduce((s, p) => s + p.valor_total, 0), color: '#d97706' },
      { name: 'Acima de R$ 10k', qtd: maior10k.length, valor: maior10k.reduce((s, p) => s + p.valor_total, 0), color: '#dc2626' },
    ];
  }, [filteredLatest]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Dashboard</h1>
          {!isEmpty && (
            <p className="text-sm text-muted-foreground mt-1">
              {formatNumber(latest.length)} produtos · Última importação: {new Date(snapshots[snapshots.length - 1]?.data_importacao).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl shadow-card p-12 text-center">
          <p className="text-muted-foreground text-sm">Nenhuma importação realizada.</p>
          <p className="text-muted-foreground text-xs mt-1">Use o botão "Importar Relatório ERP" para começar.</p>
        </motion.div>
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

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              title="Estoque Crítico (>365d)"
              value={formatCurrency(kpis.valorParado365)}
              subtitle={`${formatNumber(kpis.qtd365)} itens`}
              valueClassName="text-aging-critical"
            />
            <KPICard
              title="Estoque Crítico (>365d)"
              value={formatCurrency(kpis.valorParado365)}
              subtitle={`${formatNumber(kpis.qtd365)} itens`}
              valueClassName="text-aging-critical"
            />
            <KPICard
              title="Ticket Médio por SKU"
              value={formatCurrency(kpis.ticketMedio)}
              subtitle="Valor médio em estoque por produto"
            />
            <KPICard
              title="Ticket Médio por SKU"
              value={formatCurrency(kpis.ticketMedio)}
              subtitle="Valor médio em estoque por produto"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              title="Concentração (Pareto)"
              value={`${kpis.pctPareto.toFixed(0)}% dos SKUs`}
              subtitle={`${formatNumber(kpis.skusPareto)} SKUs = 80% do valor`}
            />
            <KPICard
              title="Importações Realizadas"
              value={String(snapshots.length)}
              subtitle={snapshots.length > 1 ? 'Compare a evolução abaixo' : 'Importe mais para ver evolução'}
            />
            <KPICard
              title="Total SKUs"
              value={formatNumber(kpis.totalSKUs)}
              subtitle={isFiltered ? 'Filtro aplicado' : 'Todos os produtos'}
            />
            <KPICard
              title="Valor Total"
              value={formatCurrency(kpis.valorTotal)}
              subtitle={isFiltered ? 'Filtro aplicado' : undefined}
            />
          </div>

          {/* Charts Row 1: Última Compra + Custo Médio */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl shadow-card p-5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Última Compra — Distribuição</p>
              <p className="text-[10px] text-muted-foreground mb-3">Produtos agrupados pela data da última compra</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={compraDistribuicao}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(215 16% 47%)" interval={0} />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" />
                  <Tooltip formatter={(v: number, name: string) => name === 'Valor' ? formatCurrency(v) : formatNumber(v)} />
                  <Bar dataKey="qtd" name="Produtos" radius={[4, 4, 0, 0]}>
                    {compraDistribuicao.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card rounded-xl shadow-card p-5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Produtos por Custo Médio</p>
              <p className="text-[10px] text-muted-foreground mb-3">Faixas de valor unitário com quantidade de itens</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={custoDistribuicao}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(215 16% 47%)" interval={0} />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" />
                  <Tooltip
                    formatter={(v: number, name: string) => name === 'Valor Total' ? formatCurrency(v) : formatNumber(v)}
                  />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="qtd" name="Qtd Itens" radius={[4, 4, 0, 0]}>
                    {custoDistribuicao.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          </div>

          {/* Charts Row 2: Curva ABC + Evolução */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                  <Line type="linear" dataKey="pctSKUs" stroke="hsl(215 16% 47% / 0.3)" strokeDasharray="4 4" dot={false} name="Igualdade" />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-xl shadow-card p-5">
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

          {/* Top stagnant products table */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="bg-card rounded-xl shadow-card overflow-hidden">
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
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Dias s/ Compra</th>
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
                      <td className="px-4 py-2.5 text-right font-mono">{item.dias_sem_compra < 0 ? '—' : item.dias_sem_compra}</td>
                      <td className="px-4 py-2.5 text-center"><AgingBadge dias={item.dias_sem_compra} /></td>
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
