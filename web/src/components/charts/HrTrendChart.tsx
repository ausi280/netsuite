import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HrBreakdownRow } from '../../api/types';
import { ChartTooltip } from './ChartTooltip';
import styles from './charts.module.css';

interface HrTrendChartProps {
  rows: HrBreakdownRow[];
  metricLabel: string;
  formatLabel: (key: string) => string;
  formatValue: (value: number) => string;
}

/** Single-series area/line for the "Contrataciones por Mes" trend view (hires by hiring_date -
 * the only true time series this snapshot table supports, since it has no termination-date
 * history to reconstruct headcount-over-time from). One brand hue, per the sequential/
 * 1-categorical rule for trend-over-time. */
export function HrTrendChart({ rows, metricLabel, formatLabel, formatValue }: HrTrendChartProps) {
  return (
    <div className={styles.chartWrapper}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="none" vertical={false} />
          <XAxis
            dataKey="key"
            tickFormatter={formatLabel}
            tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--chart-axis)' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatValue}
            tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1 }}
            content={<ChartTooltip formatLabel={(label) => formatLabel(String(label))} formatValue={formatValue} metricName={metricLabel} />}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="var(--color-primary)"
            strokeWidth={2}
            strokeLinecap="round"
            fill="var(--color-primary)"
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-white)', fill: 'var(--color-primary)' }}
            animationDuration={450}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
