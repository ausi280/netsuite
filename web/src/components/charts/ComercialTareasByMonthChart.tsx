import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { StackedChartTooltip } from './StackedChartTooltip';
import styles from './charts.module.css';

export interface TareasByMonthStack {
  key: string;
  anio: number;
  mes: number;
  '0': number;
  '1-2': number;
  '3-5': number;
  '6-9': number;
  '10+': number;
}

interface ComercialTareasByMonthChartProps {
  rows: TareasByMonthStack[];
  formatValue: (value: number) => string;
}

// A coarser 5-bucket scheme than ComercialTareasChart's 11 discrete buckets (see
// bucketTareasByMonth in utils/comercial.ts for why) - paired with a genuine sequential
// light->dark ramp off the one brand hue, not a categorical palette, since these buckets are an
// ordinal progression (fewer tareas -> more tareas), not independent identities.
const BUCKET_LABELS: Record<string, string> = {
  '0': '0 tareas',
  '1-2': '1-2 tareas',
  '3-5': '3-5 tareas',
  '6-9': '6-9 tareas',
  '10+': '10+ tareas',
};
const BUCKET_COLORS: Record<string, string> = {
  '0': 'var(--color-primary-tint3)',
  '1-2': 'var(--color-primary-tint2)',
  '3-5': 'var(--color-primary-tint1)',
  '6-9': 'var(--color-primary)',
  '10+': 'var(--color-primary-hover)',
};
const BUCKET_KEYS = ['0', '1-2', '3-5', '6-9', '10+'] as const;

/** Prospectos por mes de captura, apilados por su número de tareas (bucketed más grueso que
 * ComercialTareasChart) - mismo patrón de mes que MarketingQualificationChart. */
export function ComercialTareasByMonthChart({ rows, formatValue }: ComercialTareasByMonthChartProps) {
  return (
    <>
      <div className={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="none" vertical={false} />
            <XAxis
              dataKey="key"
              tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--chart-axis)' }}
              tickLine={false}
              interval={rows.length > 12 ? Math.ceil(rows.length / 12) - 1 : 0}
              angle={-20}
              textAnchor="end"
              height={56}
            />
            <YAxis tickFormatter={formatValue} tick={{ fill: 'var(--chart-muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              cursor={{ fill: 'var(--color-primary-soft)' }}
              content={
                <StackedChartTooltip
                  formatLabel={(label) => label}
                  formatValue={formatValue}
                  seriesLabel={(key) => BUCKET_LABELS[key] ?? key}
                />
              }
            />
            {BUCKET_KEYS.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                name={key}
                stackId="tareas"
                fill={BUCKET_COLORS[key]}
                radius={index === BUCKET_KEYS.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                maxBarSize={28}
                animationDuration={450}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.legendRow}>
        {BUCKET_KEYS.map((key) => (
          <span className={styles.legendItem} key={key}>
            <span className={styles.legendSwatch} style={{ backgroundColor: BUCKET_COLORS[key] }} aria-hidden="true" />
            {BUCKET_LABELS[key]}
          </span>
        ))}
      </div>
    </>
  );
}
