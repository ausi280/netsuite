import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from './ChartTooltip';
import styles from './charts.module.css';

export interface TareasBucket {
  key: string;
  count: number;
}

interface ComercialTareasChartProps {
  rows: TareasBucket[];
  metricLabel: string;
  formatValue: (value: number) => string;
  /** Tooltip row label for a given x-axis key - defaults to "{key} tareas" (the tareas-bucket
   * reading). Pass an override to reuse this single-series chart for a different x-axis, e.g. a
   * month label, where "{month} tareas" would read wrong. */
  formatLabel?: (key: string) => string;
}

/** A single count series over a categorical x-axis (tareas bucket, or a month label) - single
 * brand hue, per the "one series -> one color" convention this app already uses for a plain
 * nominal-category count (HrBarChart's age/seniority buckets). */
export function ComercialTareasChart({ rows, metricLabel, formatValue, formatLabel = (key) => `${key} tareas` }: ComercialTareasChartProps) {
  return (
    <div className={styles.chartWrapper}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="none" vertical={false} />
          <XAxis
            dataKey="key"
            tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--chart-axis)' }}
            tickLine={false}
            interval={0}
          />
          <YAxis tickFormatter={formatValue} tick={{ fill: 'var(--chart-muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            cursor={{ fill: 'var(--color-primary-soft)' }}
            content={<ChartTooltip formatLabel={formatLabel} formatValue={formatValue} metricName={metricLabel} />}
          />
          <Bar dataKey="count" fill="var(--color-primary)" radius={[6, 6, 0, 0]} maxBarSize={36} animationDuration={450}>
            <LabelList
              dataKey="count"
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
