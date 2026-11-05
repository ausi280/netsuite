import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { QualificationByMonthRow } from '../../api/types';
import { StackedChartTooltip } from './StackedChartTooltip';
import styles from './charts.module.css';

interface MarketingQualificationChartProps {
  rows: QualificationByMonthRow[];
  formatValue: (value: number) => string;
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatMonthKey(key: string): string {
  const [anio, mes] = key.split('-');
  const monthLabel = MONTH_LABELS[Number(mes) - 1] ?? mes;
  return `${monthLabel} ${anio}`;
}

// Same blue/neutral family as MarketingSalesChart's Online/Offline split, not the status
// good/warning/critical triad, per explicit instruction to make this chart look like the sales one
// instead of a traffic-light: blues = contacted and still viable, neutrals = everything else.
// Stacked in this order so lightness alternates between neighbors. Validated via the dataviz skill's
// validate_palette.js: CVD separation and normal-vision floor pass; it fails "grays don't read as
// saturated hues," the same accepted tradeoff hrAnalytics.ts's own status/gender binary charts
// already ship with in this app. The light shades' contrast warning is covered by the legend,
// tooltip and the per-motivo table.
const SERIES = [
  { key: 'prospecto', label: 'Prospecto', color: 'var(--color-primary)' },
  { key: 'datos_incompletos', label: 'Contactado: datos incompletos', color: 'var(--color-primary-tint2)' },
  { key: 'no_calificado', label: 'No calificado', color: 'var(--color-secondary)' },
  { key: 'no_contactado', label: 'No contactado', color: 'var(--color-neutral-400)' },
  { key: 'lead_invalido', label: 'Lead inválido', color: 'var(--color-neutral-900)' },
  { key: 'en_intento', label: 'En intento', color: 'var(--color-neutral-300)' },
] as const;
const SERIES_LABELS: Record<string, string> = Object.fromEntries(SERIES.map((s) => [s.key, s.label]));

/** Lead classification per year/month by capture date - stacked bar, mirroring
 * MarketingSalesChart's month-bucketing convention. Categories with no leads in the period are left
 * out (Argentina only uses three), keeping each one's color. */
export function MarketingQualificationChart({ rows, formatValue }: MarketingQualificationChartProps) {
  const data = rows.map((row) => ({
    key: `${row.anio}-${row.mes}`,
    prospecto: row.prospecto,
    datos_incompletos: row.datos_incompletos,
    no_calificado: row.no_calificado,
    no_contactado: row.no_contactado,
    lead_invalido: row.lead_invalido,
    en_intento: row.en_intento,
  }));
  const visibleSeries = SERIES.filter((series) => data.some((row) => row[series.key] > 0));

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
            <Tooltip
              cursor={{ fill: 'var(--color-primary-soft)' }}
              content={
                <StackedChartTooltip formatLabel={formatMonthKey} formatValue={formatValue} seriesLabel={(key) => SERIES_LABELS[key] ?? key} />
              }
            />
            {visibleSeries.map((series, index) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                name={series.key}
                stackId="calificacion"
                fill={series.color}
                stroke="var(--color-white)"
                strokeWidth={1}
                radius={index === visibleSeries.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                maxBarSize={28}
                animationDuration={450}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.legendRow}>
        {visibleSeries.map((series) => (
          <span className={styles.legendItem} key={series.key}>
            <span className={styles.legendSwatch} style={{ backgroundColor: series.color }} aria-hidden="true" />
            {series.label}
          </span>
        ))}
      </div>
    </>
  );
}
