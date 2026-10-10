import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PostventaAsuntoRow } from '../../api/types';
import { ChartTooltip } from './ChartTooltip';
import styles from './charts.module.css';

interface PostventaByAsuntoChartProps {
  rows: PostventaAsuntoRow[];
  formatValue: (value: number) => string;
}

// Same fixed categorical palette hrAnalytics.ts's CATEGORY_PALETTE uses for other open-ended,
// many-category breakdowns (brand/department) - asunto is free text, so the set of labels isn't
// known in advance (today it's ~5: the 3 "Postventa::" motivos, the "Sin asunto" fallback below,
// and the occasional outlier like "Software").
const CATEGORY_PALETTE = [
  'var(--color-primary)',
  'var(--color-neutral-800)',
  'var(--color-secondary)',
  'var(--color-neutral-300)',
  'var(--color-primary-tint1)',
  'var(--color-secondary-tint1)',
  'var(--color-primary-tint2)',
  'var(--color-secondary-tint2)',
  'var(--color-primary-tint3)',
];

/** Postventa ticket counts by (normalized) asunto, across the whole filtered range - a plain bar
 * chart (magnitude comparison across categories), not a monthly trend like PostventaByMonthChart,
 * since the question this answers is "which motivos dominate" rather than "how did this change over
 * time". Rows arrive pre-sorted descending by count from the backend. */
export function PostventaByAsuntoChart({ rows, formatValue }: PostventaByAsuntoChartProps) {
  const data = rows.map((row) => ({ key: row.asunto, count: row.cantidad }));

  return (
    <>
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
              angle={data.length > 3 ? -20 : 0}
              textAnchor={data.length > 3 ? 'end' : 'middle'}
              height={data.length > 3 ? 64 : 30}
            />
            <YAxis tickFormatter={formatValue} tick={{ fill: 'var(--chart-muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              cursor={{ fill: 'var(--color-primary-soft)' }}
              content={<ChartTooltip formatValue={formatValue} metricName="tickets" />}
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48} animationDuration={450}>
              {data.map((row, index) => (
                <Cell key={row.key} fill={CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]} />
              ))}
              <LabelList
                dataKey="count"
                position="top"
                formatter={(value: unknown) => formatValue(Number(value ?? 0))}
                style={{ fill: 'var(--color-neutral-900)', fontSize: 12 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
