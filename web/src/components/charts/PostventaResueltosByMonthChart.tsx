import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PostventaResueltoMonthRow } from '../../api/types';
import { ChartTooltip } from './ChartTooltip';
import styles from './charts.module.css';

interface PostventaResueltosByMonthChartProps {
  rows: PostventaResueltoMonthRow[];
  formatValue: (value: number) => string;
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatMonthKey(key: string): string {
  const [anio, mes] = key.split('-');
  const monthLabel = MONTH_LABELS[Number(mes) - 1] ?? mes;
  return `${monthLabel} ${anio}`;
}

/** Resuelto-state Postventa tickets per year/month of their own "fecha resuelto" (close_at_zammad) -
 * a single-series count, same "one series -> one color" convention as ComercialTareasChart/
 * HrBarChart, using the same green already established for the Resuelto tile/legend elsewhere on
 * this page for visual consistency. A different question than PostventaByMonthChart's by-month
 * breakdown: that one buckets every ticket by when it was CREATED; this one only looks at tickets
 * that reached Resuelto, bucketed by when they got there. */
export function PostventaResueltosByMonthChart({ rows, formatValue }: PostventaResueltosByMonthChartProps) {
  const data = rows.map((row) => ({ key: `${row.anio}-${row.mes}`, resueltos: row.resueltos }));

  return (
    <div className={styles.chartWrapper}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="none" vertical={false} />
          <XAxis
            dataKey="key"
            tickFormatter={formatMonthKey}
            tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--chart-axis)' }}
            tickLine={false}
            interval={data.length > 12 ? Math.ceil(data.length / 12) - 1 : 0}
            angle={-20}
            textAnchor="end"
            height={56}
          />
          <YAxis tickFormatter={formatValue} tick={{ fill: 'var(--chart-muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            cursor={{ fill: 'var(--color-primary-soft)' }}
            content={<ChartTooltip formatLabel={formatMonthKey} formatValue={formatValue} metricName="Resueltos" />}
          />
          <Bar dataKey="resueltos" fill="var(--status-good)" radius={[6, 6, 0, 0]} maxBarSize={36} animationDuration={450}>
            <LabelList
              dataKey="resueltos"
              position="top"
              formatter={(value: unknown) => formatValue(Number(value ?? 0))}
              style={{ fill: 'var(--color-neutral-800)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
