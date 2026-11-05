import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '../../utils/format';
import { IMPORTE_PAGADO_CURRENCY } from '../../utils/cobranzaCommissions';
import styles from './charts.module.css';

export interface CobranzaGoalProgressRow {
  employee_id: string;
  nombre: string;
  /** What the person collected themselves. */
  collected: number;
  /** Their equal share of the Bolsa Domiciliado pool. */
  bolsa: number;
  goal: number;
  /** collected / goal × 100. */
  ownPct: number;
  /** bolsa / goal × 100. */
  bolsaPct: number;
  /** What they get from their subsidiaria's Reparto de Bolsa (0 when they don't take part) - paid
   * on top, never part of `pct`. */
  reparto: number;
  /** reparto / goal × 100. */
  repartoPct: number;
  /** (collected + bolsa) / goal × 100. */
  pct: number;
}

interface CobranzaGoalProgressChartProps {
  rows: CobranzaGoalProgressRow[];
}

const ROW_HEIGHT = 30;
const OWN_COLOR = 'var(--color-primary)';
const BOLSA_COLOR = 'var(--color-primary-tint1)';
const REPARTO_COLOR = 'var(--color-secondary-tint2)';
const formatPct = (value: number) => `${Math.round(value)}%`;

function ProgressTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: CobranzaGoalProgressRow }> }) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;

  return (
    <div className={styles.tooltip} role="status">
      <p className={styles.tooltipLabel}>{row.nombre}</p>
      <div className={styles.tooltipRow}>
        <span className={styles.tooltipKey} style={{ backgroundColor: OWN_COLOR }} aria-hidden="true" />
        <span className={styles.tooltipValue}>{formatCurrency(row.collected, IMPORTE_PAGADO_CURRENCY)}</span>
        <span className={styles.tooltipMetric}>cobrado propio ({formatPct(row.ownPct)})</span>
      </div>
      <div className={styles.tooltipRow}>
        <span className={styles.tooltipKey} style={{ backgroundColor: BOLSA_COLOR }} aria-hidden="true" />
        <span className={styles.tooltipValue}>{formatCurrency(row.bolsa, IMPORTE_PAGADO_CURRENCY)}</span>
        <span className={styles.tooltipMetric}>parte de la Bolsa Domiciliado ({formatPct(row.bolsaPct)})</span>
      </div>
      <p className={styles.tooltipMetric}>
        Avance: {formatPct(row.pct)} de {formatCurrency(row.goal, IMPORTE_PAGADO_CURRENCY)}
      </p>
      {row.reparto > 0 ? (
        <div className={styles.tooltipRow}>
          <span className={styles.tooltipKey} style={{ backgroundColor: REPARTO_COLOR }} aria-hidden="true" />
          <span className={styles.tooltipValue}>{formatCurrency(row.reparto, IMPORTE_PAGADO_CURRENCY)}</span>
          <span className={styles.tooltipMetric}>Reparto de Bolsa (adicional, no suma al avance)</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * % of monthly goal reached per Dueño/Cobrador - one horizontal bar per person (names read better
 * on the y-axis than angled under columns), stacked: what they collected themselves in the brand
 * hue, plus their equal share of the Bolsa Domiciliado in a lighter tint of it, with a dashed reference line at
 * 100% marking "goal met". Their Reparto de Bolsa, when they take part, is stacked last in a
 * neutral gray - it's paid on top and isn't part of the avance %, so the end label keeps showing the
 * avance only. Cobrado/meta amounts live in the tooltip and in the table beside it - one axis only,
 * so the currency figures never share a scale with the %.
 */
export function CobranzaGoalProgressChart({ rows }: CobranzaGoalProgressChartProps) {
  const maxPct = Math.max(100, ...rows.map((r) => r.pct + r.repartoPct));
  const hasBolsa = rows.some((r) => r.bolsa > 0);
  const hasReparto = rows.some((r) => r.reparto > 0);

  return (
    <div>
      {hasBolsa || hasReparto ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 8 }}>
          <span className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ backgroundColor: OWN_COLOR }} aria-hidden="true" />
            Cobrado propio
          </span>
          {hasBolsa ? (
            <span className={styles.legendItem}>
              <span className={styles.legendSwatch} style={{ backgroundColor: BOLSA_COLOR }} aria-hidden="true" />
              Parte de la Bolsa Domiciliado
            </span>
          ) : null}
          {hasReparto ? (
            <span className={styles.legendItem}>
              <span className={styles.legendSwatch} style={{ backgroundColor: REPARTO_COLOR }} aria-hidden="true" />
              Reparto de Bolsa (adicional, no suma al avance)
            </span>
          ) : null}
        </div>
      ) : null}
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
            <Bar dataKey="ownPct" stackId="pct" fill={OWN_COLOR} maxBarSize={18} animationDuration={450} />
            <Bar dataKey="bolsaPct" stackId="pct" fill={BOLSA_COLOR} stroke="var(--color-white)" strokeWidth={2} maxBarSize={18} animationDuration={450} />
            <Bar
              dataKey="repartoPct"
              stackId="pct"
              fill={REPARTO_COLOR}
              stroke="var(--color-white)"
              strokeWidth={2}
              radius={[0, 4, 4, 0]}
              maxBarSize={18}
              animationDuration={450}
            >
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
    </div>
  );
}
