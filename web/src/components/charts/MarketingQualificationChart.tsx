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

// Same blue/neutral palette as MarketingSalesChart's Online/Offline split (var(--color-primary) /
// var(--color-neutral-800)), extended with one more neutral shade for the third category - not
// the status good/warning/critical triad used before, per explicit instruction to make this chart
// look like the sales one instead of a traffic-light. Validated via the dataviz skill's
// validate_palette.js: CVD separation and normal-vision floor both pass with strong margins; the
// only checks it fails are "grays don't read as saturated hues," the same accepted tradeoff
// hrAnalytics.ts's own status/gender binary charts already ship with in this app.
const SERIES_LABELS: Record<string, string> = {
  calificados: 'Calificados',
  no_contactado: 'No contactado',
  lead_no_calificado: 'Lead no calificado',
};
const SERIES_COLORS: Record<string, string> = {
  calificados: 'var(--color-primary)',
  no_contactado: 'var(--color-neutral-300)',
  lead_no_calificado: 'var(--color-neutral-800)',
};

/** Prospecto qualification (Calificados / No contactado / Lead no calificado), per year/month by
 * FechaCaptura - stacked bar, mirroring MarketingSalesChart's month-bucketing convention. */
export function MarketingQualificationChart({ rows, formatValue }: MarketingQualificationChartProps) {
  const data = rows.map((row) => ({
    key: `${row.anio}-${row.mes}`,
    calificados: row.calificados,
    no_contactado: row.no_contactado,
    lead_no_calificado: row.lead_no_calificado,
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
            <Tooltip
              cursor={{ fill: 'var(--color-primary-soft)' }}
              content={
                <StackedChartTooltip formatLabel={formatMonthKey} formatValue={formatValue} seriesLabel={(key) => SERIES_LABELS[key] ?? key} />
              }
            />
            <Bar
              dataKey="calificados"
              name="calificados"
              stackId="calificacion"
              fill={SERIES_COLORS.calificados}
              radius={[0, 0, 0, 0]}
              maxBarSize={28}
              animationDuration={450}
            />
            <Bar
              dataKey="no_contactado"
              name="no_contactado"
              stackId="calificacion"
              fill={SERIES_COLORS.no_contactado}
              radius={[0, 0, 0, 0]}
              maxBarSize={28}
              animationDuration={450}
            />
            <Bar
              dataKey="lead_no_calificado"
              name="lead_no_calificado"
              stackId="calificacion"
              fill={SERIES_COLORS.lead_no_calificado}
              radius={[6, 6, 0, 0]}
              maxBarSize={28}
              animationDuration={450}
            />
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
