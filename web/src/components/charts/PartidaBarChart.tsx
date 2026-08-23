import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PartidaBreakdownRow } from '../../api/types';
import type { DimensionConfig } from '../../config/partidaAnalytics';
import { ChartTooltip } from './ChartTooltip';
import styles from './charts.module.css';

interface PartidaBarChartProps {
  rows: PartidaBreakdownRow[];
  metric: 'count' | 'sum';
  metricLabel: string;
  dimension: DimensionConfig;
  formatValue: (value: number) => string;
  formatAxisValue: (value: number) => string;
}

/**
 * Bar chart for nominal-category breakdowns (status/subsidiary/service type). Every bar takes
 * the single brand hue unless the dimension defines per-key colors (status - where color means
 * good/bad, not "series 4") - per the "one series -> one color for every bar" rule, coloring by
 * value/rank is never used here.
 */
export function PartidaBarChart({ rows, metric, metricLabel, dimension, formatValue, formatAxisValue }: PartidaBarChartProps) {
  const hasStatusColors = Boolean(dimension.keyColor);

  return (
    <>
      <div className={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="none" vertical={false} />
            <XAxis
              dataKey="key"
              tickFormatter={dimension.keyLabel}
              tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--chart-axis)' }}
              tickLine={false}
              interval={0}
              angle={rows.length > 5 ? -20 : 0}
              textAnchor={rows.length > 5 ? 'end' : 'middle'}
              height={rows.length > 5 ? 56 : 30}
            />
            <YAxis
              tickFormatter={formatAxisValue}
              tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Tooltip
              cursor={{ fill: 'var(--color-primary-soft)' }}
              content={
                <ChartTooltip formatLabel={(label) => dimension.keyLabel(String(label))} formatValue={formatValue} metricName={metricLabel} />
              }
            />
            <Bar dataKey={metric} radius={[4, 4, 0, 0]} maxBarSize={24} animationDuration={450}>
              {rows.map((row) => (
                <Cell key={row.key} fill={dimension.keyColor?.(row.key) ?? 'var(--color-primary)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {hasStatusColors ? (
        <div className={styles.legendRow}>
          {rows.map((row) => (
            <span className={styles.legendItem} key={row.key}>
              <span className={styles.legendSwatch} style={{ backgroundColor: dimension.keyColor?.(row.key) }} aria-hidden="true" />
              {dimension.keyIcon?.(row.key) ? <span className={styles.legendIcon}>{dimension.keyIcon(row.key)}</span> : null}
              {dimension.keyLabel(row.key)}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}
