import styles from './charts.module.css';

interface ChartTooltipPayloadEntry {
  value?: number;
  color?: string;
  name?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string;
  payload?: ChartTooltipPayloadEntry[];
  /** Resolves the raw x-axis key back to its display label (charts pass the raw key as `label`). */
  formatLabel?: (label: string) => string;
  /** Resolves a series value to its display string (currency vs. plain count). */
  formatValue: (value: number) => string;
  metricName: string;
}

/**
 * Shared tooltip: value leads (Strong, high-contrast), series name follows (secondary) - the
 * legend's hierarchy inverted, since here the reader already has the category and wants the
 * number. Keys its series with a short line stroke, not a filled swatch box.
 */
export function ChartTooltip({ active, label, payload, formatLabel, formatValue, metricName }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const entry = payload[0];
  const displayLabel = label !== undefined ? (formatLabel ? formatLabel(label) : label) : '';

  return (
    <div className={styles.tooltip} role="status">
      <p className={styles.tooltipLabel}>{displayLabel}</p>
      <div className={styles.tooltipRow}>
        <span className={styles.tooltipKey} style={{ backgroundColor: entry.color ?? 'var(--color-primary)' }} aria-hidden="true" />
        <span className={styles.tooltipValue}>{formatValue(entry.value ?? 0)}</span>
        <span className={styles.tooltipMetric}>{metricName}</span>
      </div>
    </div>
  );
}
