import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HrBreakdownRow } from '../../api/types';
import type { HrDimensionConfig } from '../../config/hrAnalytics';
import { ChartTooltip } from './ChartTooltip';
import styles from './charts.module.css';

interface HrBarChartProps {
  rows: HrBreakdownRow[];
  metricLabel: string;
  dimension: HrDimensionConfig;
  formatValue: (value: number) => string;
}

/**
 * Bar chart for HR's nominal-category breakdowns (brand/department/gender/country/age/seniority).
 * Every bar takes the single brand hue unless the dimension defines per-key colors ('status' -
 * where color means active/inactive, not "series 4") - same "one series -> one color" rule as
 * PartidaBarChart, kept as its own small component since HrBreakdownRow has no currency/sum
 * concept to thread through a shared generic.
 */
export function HrBarChart({ rows, metricLabel, dimension, formatValue }: HrBarChartProps) {
  const showLegend = Boolean(dimension.showLegend);

  return (
    <>
      <div className={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
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
              tickFormatter={formatValue}
              tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ fill: 'var(--color-primary-soft)' }}
              content={
                <ChartTooltip formatLabel={(label) => dimension.keyLabel(String(label))} formatValue={formatValue} metricName={metricLabel} />
              }
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={28} animationDuration={450}>
              {rows.map((row, index) => (
                <Cell key={row.key} fill={dimension.keyColor?.(row.key, index) ?? 'var(--color-primary)'} />
              ))}
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
      {showLegend ? (
        <div className={styles.legendRow}>
          {rows.map((row, index) => (
            <span className={styles.legendItem} key={row.key}>
              <span className={styles.legendSwatch} style={{ backgroundColor: dimension.keyColor?.(row.key, index) }} aria-hidden="true" />
              {dimension.keyLabel(row.key)}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}
