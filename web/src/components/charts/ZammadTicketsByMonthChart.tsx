import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ZammadTicketsMonthRow } from '../../api/types';
import styles from './charts.module.css';

interface ZammadTicketsByMonthChartProps {
  rows: ZammadTicketsMonthRow[];
  formatValue: (value: number) => string;
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatMonthKey(key: string): string {
  const [anio, mes] = key.split('-');
  const monthLabel = MONTH_LABELS[Number(mes) - 1] ?? mes;
  return `${monthLabel} ${anio}`;
}

const SERIES_LABELS: Record<string, string> = {
  creados: 'Creados',
  primeraAtencion: 'Primera Atención',
  cerrados: 'Cerrados',
};
const SERIES_COLORS: Record<string, string> = {
  creados: 'var(--color-primary)',
  primeraAtencion: 'var(--status-warning)',
  cerrados: 'var(--status-good)',
};

interface TooltipPayloadEntry {
  value?: number;
  color?: string;
  dataKey?: string;
}

interface GroupedTooltipProps {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadEntry[];
  formatValue: (value: number) => string;
}

/** Twin of StackedChartTooltip, minus its "Total" row - these three series don't partition a
 * meaningful total (one ticket counts toward all three, each in its own month), so summing them
 * would be misleading. */
function GroupedTooltip({ active, label, payload, formatValue }: GroupedTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className={styles.tooltip} role="status">
      <p className={styles.tooltipLabel}>{label ? formatMonthKey(label) : ''}</p>
      {payload.map((entry) => (
        <div className={styles.tooltipRow} key={entry.dataKey}>
          <span className={styles.tooltipKey} style={{ backgroundColor: entry.color ?? 'var(--color-primary)' }} aria-hidden="true" />
          <span className={styles.tooltipValue}>{formatValue(entry.value ?? 0)}</span>
          <span className={styles.tooltipMetric}>{SERIES_LABELS[entry.dataKey ?? ''] ?? entry.dataKey}</span>
        </div>
      ))}
    </div>
  );
}

/** Zammad tickets (every group) per year/month of each of the three lifecycle dates - creación,
 * primera atención, cierre. Rendered as GROUPED (not stacked) bars, unlike every other multi-series
 * chart in this app: these three counts don't partition a single total the way Postventa's estado
 * buckets or Marketing's online/offline split do - one ticket contributes to all three counts, each
 * in whatever month that particular event happened, so stacking them would imply a meaningless sum. */
export function ZammadTicketsByMonthChart({ rows, formatValue }: ZammadTicketsByMonthChartProps) {
  const data = rows.map((row) => ({
    key: `${row.anio}-${row.mes}`,
    creados: row.creados,
    primeraAtencion: row.primeraAtencion,
    cerrados: row.cerrados,
  }));

  return (
    <>
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
            <Tooltip cursor={{ fill: 'var(--color-primary-soft)' }} content={<GroupedTooltip formatValue={formatValue} />} />
            <Bar dataKey="creados" name="creados" fill={SERIES_COLORS.creados} radius={[4, 4, 0, 0]} maxBarSize={18} animationDuration={450} />
            <Bar
              dataKey="primeraAtencion"
              name="primeraAtencion"
              fill={SERIES_COLORS.primeraAtencion}
              radius={[4, 4, 0, 0]}
              maxBarSize={18}
              animationDuration={450}
            />
            <Bar dataKey="cerrados" name="cerrados" fill={SERIES_COLORS.cerrados} radius={[4, 4, 0, 0]} maxBarSize={18} animationDuration={450} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.legendRow}>
        {(Object.keys(SERIES_LABELS) as Array<keyof typeof SERIES_LABELS>).map((key) => (
          <span className={styles.legendItem} key={key}>
            <span className={styles.legendSwatch} style={{ backgroundColor: SERIES_COLORS[key] }} aria-hidden="true" />
            {SERIES_LABELS[key]}
          </span>
        ))}
      </div>
    </>
  );
}
