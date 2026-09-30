import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { HrBreakdownRow } from '../../api/types';
import type { HrDimensionConfig } from '../../config/hrAnalytics';
import { ChartTooltip } from './ChartTooltip';
import styles from './charts.module.css';

interface HrDonutChartProps {
  rows: HrBreakdownRow[];
  metricLabel: string;
  dimension: HrDimensionConfig;
  formatValue: (value: number) => string;
}

/**
 * Donut chart for HR's small, meaningful-color breakdowns (currently only 'gender') - a circle
 * reads a two/three-way split faster than a bar chart does, unlike the nominal-category
 * dimensions (brand/department/country) which stay bars since a donut with 9+ slices is unreadable.
 */
export function HrDonutChart({ rows, metricLabel, dimension, formatValue }: HrDonutChartProps) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <>
      <div className={styles.donutWrapper}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="count"
              nameKey="key"
              startAngle={90}
              endAngle={-270}
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="var(--color-white)"
              strokeWidth={2}
              animationDuration={450}
            >
              {rows.map((row, index) => (
                <Cell key={row.key} fill={dimension.keyColor?.(row.key, index) ?? 'var(--color-primary)'} />
              ))}
            </Pie>
            <Tooltip
              content={<ChartTooltip formatLabel={(label) => dimension.keyLabel(String(label))} formatValue={formatValue} metricName={metricLabel} />}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.donutCenter}>
          <span className={styles.donutCenterValue}>{formatValue(total)}</span>
          <span className={styles.donutCenterLabel}>{metricLabel}</span>
        </div>
      </div>
      {dimension.showLegend ? (
        <div className={styles.legendRow}>
          {rows.map((row, index) => (
            <span className={styles.legendItem} key={row.key}>
              <span className={styles.legendSwatch} style={{ backgroundColor: dimension.keyColor?.(row.key, index) }} aria-hidden="true" />
              {dimension.keyLabel(row.key)} · {formatValue(row.count)}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}
