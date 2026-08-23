import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PartidaBreakdownRow } from '../../api/types';
import { ChartTooltip } from './ChartTooltip';
import styles from './charts.module.css';

interface PartidaTrendChartProps {
  rows: PartidaBreakdownRow[];
  metric: 'count' | 'sum';
  metricLabel: string;
  formatLabel: (key: string) => string;
  formatValue: (value: number) => string;
  formatAxisValue: (value: number) => string;
}

/** Single-series area/line for the "Por Mes" trend view - one brand hue, per the sequential/1-categorical rule for trend-over-time. */
export function PartidaTrendChart({ rows, metric, metricLabel, formatLabel, formatValue, formatAxisValue }: PartidaTrendChartProps) {
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
            tickFormatter={formatAxisValue}
            tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1 }}
            content={
              <ChartTooltip formatLabel={(label) => formatLabel(String(label))} formatValue={formatValue} metricName={metricLabel} />
            }
          />
          <Area
            type="monotone"
            dataKey={metric}
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
