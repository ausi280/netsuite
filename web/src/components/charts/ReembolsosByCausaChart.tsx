import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ReembolsoCausaRow } from '../../api/types';
import { ChartTooltip } from './ChartTooltip';
import styles from './charts.module.css';

interface ReembolsosByCausaChartProps {
  rows: ReembolsoCausaRow[];
  formatValue: (value: number) => string;
}

/** Monto de reembolso por causa, across the whole filtered año - a plain bar chart (magnitude
 * comparison across categories), same "one series -> one color" convention as
 * PostventaByAsuntoChart/ComercialTareasChart. Rows arrive pre-sorted descending by monto from the
 * backend. */
export function ReembolsosByCausaChart({ rows, formatValue }: ReembolsosByCausaChartProps) {
  const data = rows.map((row) => ({ key: row.causa, monto: row.monto }));

  return (
    <div className={styles.chartWrapper}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="none" vertical={false} />
          <XAxis
            dataKey="key"
            tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--chart-axis)' }}
            tickLine={false}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={72}
          />
          <YAxis tickFormatter={formatValue} tick={{ fill: 'var(--chart-muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
          <Tooltip cursor={{ fill: 'var(--color-primary-soft)' }} content={<ChartTooltip formatValue={formatValue} metricName="reembolsado" />} />
          <Bar dataKey="monto" fill="var(--color-primary)" radius={[6, 6, 0, 0]} maxBarSize={36} animationDuration={450} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
