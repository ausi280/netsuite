import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '../../utils/format';
import { IMPORTE_PAGADO_CURRENCY } from '../../utils/cobranzaCommissions';
import styles from './charts.module.css';

export interface CobranzaGoalProgressRow {
  employee_id: string;
  nombre: string;
  collected: number;
  goal: number;
  /** collected / goal × 100. */
  pct: number;
}

interface CobranzaGoalProgressChartProps {
  rows: CobranzaGoalProgressRow[];
}

const ROW_HEIGHT = 30;
const formatPct = (value: number) => `${Math.round(value)}%`;

function ProgressTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: CobranzaGoalProgressRow }> }) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;

  return (
    <div className={styles.tooltip} role="status">
      <p className={styles.tooltipLabel}>{row.nombre}</p>
      <div className={styles.tooltipRow}>
        <span className={styles.tooltipKey} style={{ backgroundColor: 'var(--color-primary)' }} aria-hidden="true" />
        <span className={styles.tooltipValue}>{formatPct(row.pct)}</span>
        <span className={styles.tooltipMetric}>de avance</span>
      </div>
      <p className={styles.tooltipMetric}>
        {formatCurrency(row.collected, IMPORTE_PAGADO_CURRENCY)} de {formatCurrency(row.goal, IMPORTE_PAGADO_CURRENCY)}
      </p>
    </div>
  );
}

/**
 * % of monthly goal reached per Dueño/Cobrador - one horizontal bar per person (names read better
 * on the y-axis than angled under columns), a single series in the brand hue, with a dashed
 * reference line at 100% marking "goal met". Cobrado/meta amounts live in the tooltip and in the
 * table beside it - one axis only, so the two currency figures never share a scale with the %.
 */
export function CobranzaGoalProgressChart({ rows }: CobranzaGoalProgressChartProps) {
  const maxPct = Math.max(100, ...rows.map((r) => r.pct));

  return (
    <div style={{ width: '100%', height: rows.length * ROW_HEIGHT + 48 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 48, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, Math.ceil(maxPct / 25) * 25]}
            tickFormatter={formatPct}
            tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--chart-axis)' }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="nombre"
            width={180}
            interval={0}
            tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: 'var(--color-primary-soft)' }} content={<ProgressTooltip />} />
          <ReferenceLine x={100} stroke="var(--color-neutral-800)" strokeDasharray="4 4" />
          <Bar dataKey="pct" fill="var(--color-primary)" radius={[0, 4, 4, 0]} maxBarSize={18} animationDuration={450}>
            <LabelList
              dataKey="pct"
              position="right"
              formatter={(value: unknown) => formatPct(Number(value ?? 0))}
              style={{ fill: 'var(--color-neutral-800)', fontSize: 12, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
