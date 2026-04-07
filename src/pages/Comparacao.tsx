import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInventory } from '@/store/InventoryContext';
import { formatCurrency, formatDate, parseLocalDate } from '@/types/inventory';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ArrowUpRight, ArrowDownRight, Minus, GitCompareArrows } from 'lucide-react';

interface SnapshotSummary {
  snapshotId: string;
  date: string;
  valorTotal: number;
  faixas: Record<string, number>;
  giro: number;
  parado: number;
  promoAtiva: number;
  promoAtivaQtd: number;
}

const FAIXAS = ['0-90', '90-180', '180-270', '270-365', '365+', 'sem-registro'] as const;
const FAIXA_LABELS: Record<string, string> = {
  '0-90': '0 – 90 dias',
  '90-180': '90 – 180 dias',
  '180-270': '180 – 270 dias',
  '270-365': '270 – 365 dias',
  '365+': '365+ dias',
  'sem-registro': 'Sem Registro',
};

function pctDiff(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function DiffBadge({ value, invertColor = false }: { value: number | null; invertColor?: boolean }) {
  if (value === null) return <span className="text-muted-foreground text-xs">—</span>;
  const positive = value > 0;
  const isGood = invertColor ? !positive : positive;
  const color = Math.abs(value) < 0.5
    ? 'text-muted-foreground'
    : isGood
      ? 'text-emerald-600'
      : 'text-red-600';
  const Icon = Math.abs(value) < 0.5 ? Minus : positive ? ArrowUpRight : ArrowDownRight;

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${color}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function isPromoAtiva(dataFim: string | null, refDate: string): boolean {
  if (!dataFim) return false;
  const fim = parseLocalDate(dataFim);
  const ref = parseLocalDate(refDate);
  return fim >= ref;
}

export default function Comparacao() {
  const { snapshots, produtoSnapshots } = useInventory();

  const summaries = useMemo<SnapshotSummary[]>(() => {
    return snapshots
      .slice()
      .sort((a, b) => new Date(a.data_importacao).getTime() - new Date(b.data_importacao).getTime())
      .map(snap => {
        const items = produtoSnapshots.filter(ps => ps.snapshot_id === snap.id);
        const faixas: Record<string, number> = {};
        FAIXAS.forEach(f => (faixas[f] = 0));
        let valorTotal = 0;
        let promoAtiva = 0;
        let promoAtivaQtd = 0;
        items.forEach(item => {
          valorTotal += item.valor_total;
          faixas[item.categoria_estoque] = (faixas[item.categoria_estoque] || 0) + item.valor_total;
          if (isPromoAtiva(item.data_fim_promocao, snap.data_importacao)) {
            promoAtiva += item.valor_total;
            promoAtivaQtd += item.quantidade;
          }
        });
        const giro = (faixas['0-90'] || 0) + (faixas['90-180'] || 0);
        const parado = valorTotal - giro;
        return { snapshotId: snap.id, date: snap.data_importacao, valorTotal, faixas, giro, parado, promoAtiva, promoAtivaQtd };
      });
  }, [snapshots, produtoSnapshots]);

  const chartData = useMemo(() => {
    return summaries.map(s => ({
      name: formatDate(s.date),
      Giro: Math.round(s.giro),
      Parado: Math.round(s.parado),
      Total: Math.round(s.valorTotal),
      'Promoção Ativa': Math.round(s.promoAtiva),
    }));
  }, [summaries]);

  if (summaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground gap-3">
        <GitCompareArrows className="h-12 w-12" />
        <p className="text-lg font-medium">Nenhuma importação encontrada</p>
        <p className="text-sm">Importe pelo menos um relatório para ver a comparação.</p>
      </div>
    );
  }

  const rows = [
    { key: 'valorTotal', label: 'Valor Total' },
    ...FAIXAS.map(f => ({ key: f, label: FAIXA_LABELS[f] })),
    { key: 'parado', label: 'Estoque Parado (>180d)' },
    { key: 'promoAtiva', label: '🏷️ Promoção Ativa (Valor)' },
    { key: 'promoAtivaQtd', label: '🏷️ Promoção Ativa (Qtd)' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Comparação de Snapshots</h1>

      {/* Section 1 — Summary by Snapshot */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumo por Importação</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Métrica</TableHead>
                {summaries.map(s => (
                  <TableHead key={s.snapshotId} className="text-right min-w-[110px]">
                    {formatDate(s.date)}
                  </TableHead>
                ))}
                {summaries.length >= 2 && (
                  <TableHead className="text-right min-w-[90px]">Variação</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => {
                const getValue = (s: SnapshotSummary) => {
                  if (row.key === 'valorTotal') return s.valorTotal;
                  if (row.key === 'parado') return s.parado;
                  if (row.key === 'promoAtiva') return s.promoAtiva;
                  if (row.key === 'promoAtivaQtd') return s.promoAtivaQtd;
                  return s.faixas[row.key] || 0;
                };
                const isParado = row.key === 'parado' || ['180-270', '270-365', '365+'].includes(row.key);
                const isPromo = row.key === 'promoAtiva' || row.key === 'promoAtivaQtd';
                const isQtd = row.key === 'promoAtivaQtd';
                const formatValue = isQtd
                  ? (v: number) => new Intl.NumberFormat('pt-BR').format(Math.round(v))
                  : (v: number) => formatCurrency(v);

                return (
                  <TableRow
                    key={row.key}
                    className={
                      row.key === 'parado' ? 'border-t-2 font-medium' :
                      row.key === 'promoAtiva' ? 'border-t-2 font-medium bg-accent/30' :
                      isPromo ? 'bg-accent/30' : ''
                    }
                  >
                    <TableCell className="font-medium text-muted-foreground">{row.label}</TableCell>
                    {summaries.map(s => (
                      <TableCell key={s.snapshotId} className="text-right tabular-nums">
                        {formatValue(getValue(s))}
                      </TableCell>
                    ))}
                    {summaries.length >= 2 && (
                      <TableCell className="text-right">
                        <DiffBadge
                          value={pctDiff(
                            getValue(summaries[summaries.length - 1]),
                            getValue(summaries[summaries.length - 2])
                          )}
                          invertColor={isParado}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Section 2 — Historical Evolution */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Evolução Histórica</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Estoque de Giro</TableHead>
                <TableHead className="text-right">Var %</TableHead>
                <TableHead className="text-right">Estoque Parado</TableHead>
                <TableHead className="text-right">Var %</TableHead>
                <TableHead className="text-right">Promoção Ativa</TableHead>
                <TableHead className="text-right">Var %</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Var %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map((s, i) => {
                const prev = i > 0 ? summaries[i - 1] : null;
                return (
                  <TableRow key={s.snapshotId}>
                    <TableCell className="font-medium">{formatDate(s.date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(s.giro)}</TableCell>
                    <TableCell className="text-right">
                      <DiffBadge value={prev ? pctDiff(s.giro, prev.giro) : null} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(s.parado)}</TableCell>
                    <TableCell className="text-right">
                      <DiffBadge value={prev ? pctDiff(s.parado, prev.parado) : null} invertColor />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(s.promoAtiva)}</TableCell>
                    <TableCell className="text-right">
                      <DiffBadge value={prev ? pctDiff(s.promoAtiva, prev.promoAtiva) : null} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(s.valorTotal)}</TableCell>
                    <TableCell className="text-right">
                      <DiffBadge value={prev ? pctDiff(s.valorTotal, prev.valorTotal) : null} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {summaries.length >= 2 && (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" className="text-xs fill-muted-foreground" />
                  <YAxis
                    className="text-xs fill-muted-foreground"
                    tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ borderRadius: '0.5rem', border: '1px solid hsl(var(--border))' }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="Giro" stroke="hsl(160, 60%, 36%)" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Parado" stroke="hsl(0, 72%, 51%)" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Promoção Ativa" stroke="hsl(38, 92%, 50%)" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Total" stroke="hsl(222, 47%, 11%)" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
