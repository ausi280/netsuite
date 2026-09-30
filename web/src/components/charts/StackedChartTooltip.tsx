import styles from './charts.module.css';

interface StackedChartTooltipPayloadEntry {
  value?: number;
  color?: string;
  name?: string;
  dataKey?: string;
}

interface StackedChartTooltipProps {
  active?: boolean;
  label?: string;
  payload?: StackedChartTooltipPayloadEntry[];
  formatLabel: (label: string) => string;
  formatValue: (value: number) => string;
  /** Display name per dataKey (recharts' own `name`/`dataKey` on each Bar isn't always what we
   * want shown - e.g. "online" -> "Online"). */
  seriesLabel: (dataKey: string) => string;
}

/** Multi-series twin of ChartTooltip (which only ever reads payload[0]) - every stacked series
 * gets its own row, keyed by its own fill color, plus a totals row. */
export function StackedChartTooltip({ active, label, payload, formatLabel, formatValue, seriesLabel }: StackedChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const total = payload.reduce((sum, entry) => sum + (entry.value ?? 0), 0);
  const displayLabel = label !== undefined ? formatLabel(label) : '';

  return (
    <div className={styles.tooltip} role="status">
      <p className={styles.tooltipLabel}>{displayLabel}</p>
      {payload.map((entry) => (
        <div className={styles.tooltipRow} key={entry.dataKey}>
          <span className={styles.tooltipKey} style={{ backgroundColor: entry.color ?? 'var(--color-primary)' }} aria-hidden="true" />
          <span className={styles.tooltipValue}>{formatValue(entry.value ?? 0)}</span>
          <span className={styles.tooltipMetric}>{seriesLabel(entry.dataKey ?? '')}</span>
        </div>
      ))}
      <div className={styles.tooltipRow}>
        <span className={styles.tooltipValue}>{formatValue(total)}</span>
        <span className={styles.tooltipMetric}>Total</span>
      </div>
    </div>
  );
}
