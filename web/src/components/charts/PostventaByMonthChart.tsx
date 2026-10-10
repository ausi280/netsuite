import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PostventaMonthRow } from '../../api/types';
import { StackedChartTooltip } from './StackedChartTooltip';
import styles from './charts.module.css';

interface PostventaByMonthChartProps {
  rows: PostventaMonthRow[];
  formatValue: (value: number) => string;
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatMonthKey(key: string): string {
  const [anio, mes] = key.split('-');
  const monthLabel = MONTH_LABELS[Number(mes) - 1] ?? mes;
  return `${monthLabel} ${anio}`;
}

// Same colors as PostventaReportPage's own status tiles, for visual consistency between the tiles
// and this chart's legend.
const SERIES_LABELS: Record<string, string> = {
  nuevos: 'Nuevos',
  enProceso: 'En Proceso',
  cerrados: 'Cerrados',
  resueltos: 'Resueltos',
};
const SERIES_COLORS: Record<string, string> = {
  nuevos: 'var(--color-primary)',
  enProceso: 'var(--status-warning)',
  cerrados: 'var(--color-neutral-400)',
  resueltos: 'var(--status-good)',
};

/** Postventa tickets (Nuevos/En Proceso/Cerrados/Resueltos), per year/month by created_at_zammad -
 * stacked bar, mirroring MarketingQualificationChart's month-bucketing convention. */
export function PostventaByMonthChart({ rows, formatValue }: PostventaByMonthChartProps) {
  const data = rows.map((row) => ({
    key: `${row.anio}-${row.mes}`,
    nuevos: row.nuevos,
    enProceso: row.enProceso,
    cerrados: row.cerrados,
    resueltos: row.resueltos,
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
              content={<StackedChartTooltip formatLabel={formatMonthKey} formatValue={formatValue} seriesLabel={(key) => SERIES_LABELS[key] ?? key} />}
            />
            <Bar dataKey="nuevos" name="nuevos" stackId="estado" fill={SERIES_COLORS.nuevos} radius={[0, 0, 0, 0]} maxBarSize={28} animationDuration={450} />
            <Bar
              dataKey="enProceso"
              name="enProceso"
              stackId="estado"
              fill={SERIES_COLORS.enProceso}
              radius={[0, 0, 0, 0]}
              maxBarSize={28}
              animationDuration={450}
            />
            <Bar
              dataKey="cerrados"
              name="cerrados"
              stackId="estado"
              fill={SERIES_COLORS.cerrados}
              radius={[0, 0, 0, 0]}
              maxBarSize={28}
              animationDuration={450}
            />
            <Bar
              dataKey="resueltos"
              name="resueltos"
              stackId="estado"
              fill={SERIES_COLORS.resueltos}
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
