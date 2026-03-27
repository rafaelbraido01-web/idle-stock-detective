import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, AreaChart, Area, Legend, Line } from 'recharts';
import { useInventory } from '@/store/InventoryContext';
import { KPICard } from '@/components/KPICard';
import { AgingBadge } from '@/components/AgingBadge';
import { formatCurrency, formatNumber } from '@/types/inventory';
import { AlertTriangle, TrendingDown, Filter, Megaphone, BarChart3 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';

interface MarketPrice {
  produto_id: string;
  preco: number;
  updated_at: string;
  fonte: string;
}

interface Campanha {
  id: string;
  campanha: string;
  canal: string;
  data_inicio: string;
  data_fim: string;
  produto_id: string;
}

function getCampanhaStatus(c: Campanha) {
  const today = new Date().toISOString().slice(0, 10);
  if (c.data_inicio > today) return 'Futura';
  if (c.data_fim < today) return 'Encerrada';
  return 'Ativa';
}

export default function Dashboard() {
  const { snapshots, produtoSnapshots, getLatestProdutoSnapshots, produtos } = useInventory();
  const latest = getLatestProdutoSnapshots();
  const isEmpty = latest.length === 0;

  const [grupoFilter, setGrupoFilter] = useState('all');
  const [marcaFilter, setMarcaFilter] = useState('all');

  // New data from Supabase
  const [marketPrices, setMarketPrices] = useState<Record<string, MarketPrice>>({});
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);

  useEffect(() => {
    async function fetchMarketPrices() {
      const { data } = await supabase
        .from('precos_mercado')
        .select('produto_id, preco, updated_at, fonte')
        .order('updated_at', { ascending: false });
      if (data) {
        const map: Record<string, MarketPrice> = {};
        for (const row of data) {
          if (!map[row.produto_id]) map[row.produto_id] = row;
        }
        setMarketPrices(map);
      }
    }
    async function fetchCampanhas() {
      const { data } = await supabase
        .from('campanhas_produto')
        .select('id, campanha, canal, data_inicio, data_fim, produto_id');
      if (data) setCampanhas(data);
    }
    fetchMarketPrices();
    fetchCampanhas();
  }, []);

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

  // Campaign KPIs
  const campanhaKpis = useMemo(() => {
    const ativas = campanhas.filter(c => getCampanhaStatus(c) === 'Ativa');
    // Deduplicate campaign names for counting
    const uniqueAtivas = [...new Set(ativas.map(c => c.campanha))];
    return { ativasCount: uniqueAtivas.length, ativasTotal: ativas };
  }, [campanhas]);

  // Active campaigns summary (grouped by campaign name)
  const campanhasAtivasResumo = useMemo(() => {
    const ativas = campanhas.filter(c => getCampanhaStatus(c) === 'Ativa');
    const grouped: Record<string, { campanha: string; canal: string; data_fim: string; qtdProdutos: number }> = {};
    for (const c of ativas) {
      const key = `${c.campanha}__${c.canal}`;
      if (!grouped[key]) {
        grouped[key] = { campanha: c.campanha, canal: c.canal, data_fim: c.data_fim, qtdProdutos: 0 };
      }
      grouped[key].qtdProdutos++;
      if (c.data_fim < grouped[key].data_fim) grouped[key].data_fim = c.data_fim;
    }
    return Object.values(grouped).sort((a, b) => a.data_fim.localeCompare(b.data_fim));
  }, [campanhas]);

  // Market price KPIs
  const marketKpis = useMemo(() => {
    const codigoMap = new Map(produtos.map(p => [p.codigo, p.id]));
    let totalWithPrice = 0;
    let totalDiff = 0;
    let countDiff = 0;

    for (const ps of filteredLatest) {
      const produto = produtos.find(p => p.id === ps.produto_id);
      if (!produto) continue;
      const mp = marketPrices[produto.codigo];
      if (!mp) continue;
      totalWithPrice++;
      if (ps.preco_tabela > 0) {
        totalDiff += ((mp.preco - ps.preco_tabela) / ps.preco_tabela) * 100;
        countDiff++;
      }
    }
    const avgDiff = countDiff > 0 ? totalDiff / countDiff : 0;
    return { totalWithPrice, avgDiff };
  }, [filteredLatest, produtos, marketPrices]);

  // Price opportunities (market price lower than tabela = competitors cheaper)
  const priceOpportunities = useMemo(() => {
    const rows: { codigo: string; descricao: string; precoTabela: number; precoMercado: number; diff: number }[] = [];
    for (const ps of filteredLatest) {
      const produto = produtos.find(p => p.id === ps.produto_id);
      if (!produto) continue;
      const mp = marketPrices[produto.codigo];
      if (!mp || ps.preco_tabela <= 0) continue;
      const diff = ((mp.preco - ps.preco_tabela) / ps.preco_tabela) * 100;
      if (diff < 0) {
        rows.push({ codigo: produto.codigo, descricao: produto.descricao, precoTabela: ps.preco_tabela, precoMercado: mp.preco, diff });
      }
    }
    return rows.sort((a, b) => a.diff - b.diff).slice(0, 10);
  }, [filteredLatest, produtos, marketPrices]);

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

          {/* KPIs Row 1 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <KPICard
              title="Valor Total em Estoque"
              value={formatCurrency(kpis.valorTotal)}
              subtitle={`${formatNumber(kpis.totalSKUs)} SKUs ativos`}
            />
            <KPICard
              title="Concentração (Pareto)"
              value={`${kpis.pctPareto.toFixed(0)}% dos SKUs`}
              subtitle={`${formatNumber(kpis.skusPareto)} SKUs = 80% do valor`}
            />
          </div>

          {/* KPIs Row 2: Campanhas + Preço de Mercado */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KPICard
              title="Campanhas Ativas"
              value={String(campanhaKpis.ativasCount)}
              subtitle={`${campanhaKpis.ativasTotal.length} vínculos de produto`}
            />
            <KPICard
              title="Produtos c/ Preço de Mercado"
              value={String(marketKpis.totalWithPrice)}
              subtitle={`de ${formatNumber(kpis.totalSKUs)} no estoque`}
            />
            <KPICard
              title="Diferença Média (Mercado)"
              value={`${marketKpis.avgDiff >= 0 ? '+' : ''}${marketKpis.avgDiff.toFixed(1)}%`}
              subtitle="Preço mercado vs. preço tabela"
              valueClassName={marketKpis.avgDiff < 0 ? 'text-destructive' : 'text-emerald-600'}
            />
          </div>

          {/* Charts Row 1: Última Compra + Custo Médio */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl shadow-card p-5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Última Compra — Distribuição</p>
              <p className="text-[10px] text-muted-foreground mb-3">Produtos agrupados pela data da última compra</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={compraDistribuicao}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(215 16% 47%)" interval={0} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke="hsl(215 16% 47%)" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="hsl(215 16% 47%)" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number, name: string) => name === 'Valor' ? formatCurrency(v) : formatNumber(v)} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar yAxisId="left" dataKey="qtd" name="Qtd" radius={[4, 4, 0, 0]}>
                    {compraDistribuicao.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                  <Bar yAxisId="right" dataKey="valor" name="Valor" radius={[4, 4, 0, 0]} opacity={0.5}>
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

          {/* Row 3: Campanhas Ativas + Oportunidades de Preço */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Campanhas Ativas - detalhe */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl shadow-card overflow-hidden">
              <div className="p-5 pb-0 flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Campanhas Ativas</p>
              </div>
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Campanha</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Canal</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Produtos</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Encerra em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campanhasAtivasResumo.map((c, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-4 py-2.5 text-xs font-medium">{c.campanha}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.canal}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">{c.qtdProdutos}</td>
                        <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">{new Date(c.data_fim + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                      </tr>
                    ))}
                    {campanhasAtivasResumo.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-xs">Nenhuma campanha ativa no momento</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>

            {/* Oportunidades de Preço */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="bg-card rounded-xl shadow-card overflow-hidden">
              <div className="p-5 pb-0 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Oportunidades de Preço</p>
                <span className="text-[10px] text-muted-foreground ml-1">(Concorrência mais barata)</span>
              </div>
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Código</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Descrição</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">P. Tabela</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">P. Mercado</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Dif %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceOpportunities.map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-4 py-2.5 font-mono text-xs">{row.codigo}</td>
                        <td className="px-4 py-2.5 text-xs max-w-[180px] truncate">{row.descricao}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">{formatCurrency(row.precoTabela)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">{formatCurrency(row.precoMercado)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-destructive">{row.diff.toFixed(1)}%</td>
                      </tr>
                    ))}
                    {priceOpportunities.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-xs">Nenhuma oportunidade identificada</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
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
