import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ReembolsoBucket, ReembolsoMonthRow } from '../../api/types';
import { StackedChartTooltip } from './StackedChartTooltip';
import styles from './charts.module.css';

interface ReembolsosByMonthChartProps {
  rows: ReembolsoMonthRow[];
  formatValue: (value: number) => string;
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatMonthLabel(mes: string): string {
  return MONTH_LABELS[Number(mes) - 1] ?? mes;
}

// Fixed per-bucket colors (never cycled/reassigned by filter) - same categorical palette
// hrAnalytics.ts's CATEGORY_PALETTE draws from, mapped deliberately by bucket meaning rather than
// index order: 'pendiente' reuses the app's own pending/warning hue, 'otro' the dark neutral this
// app already uses to flag an uncategorized/needs-attention bucket elsewhere.
const BUCKET_ORDER: ReembolsoBucket[] = [
  'pendiente',
  'aplicadoTransferencia',
  'aplicadoAnualidades',
  'aplicadoNuevoContrato',
  'aplicadoGarantias',
  'sinReembolso',
  'otro',
];
const BUCKET_LABELS: Record<ReembolsoBucket, string> = {
  pendiente: 'Pendiente Reembolso',
  aplicadoTransferencia: 'Aplicado Transferencia',
  aplicadoAnualidades: 'Aplicado Anualidades',
  aplicadoNuevoContrato: 'Aplicado Nuevo Contrato',
  aplicadoGarantias: 'Aplicado Garantías',
  sinReembolso: 'Sin Reembolso',
  otro: 'Sin Clasificar',
};
const BUCKET_COLORS: Record<ReembolsoBucket, string> = {
  pendiente: 'var(--status-warning)',
  aplicadoTransferencia: 'var(--color-primary)',
  aplicadoAnualidades: 'var(--color-primary-tint1)',
  aplicadoNuevoContrato: 'var(--color-secondary)',
  aplicadoGarantias: 'var(--color-secondary-tint1)',
  sinReembolso: 'var(--color-neutral-400)',
  otro: 'var(--color-neutral-800)',
};

/** Reembolsos monto per mes, stacked by bucket (see reembolsosRepository.ts's classification) - one
 * bar per month, one stacked segment per bucket, same stacked-by-month convention as
 * PostventaByMonthChart (these buckets DO partition every reembolso-línea exactly once, unlike
 * ZammadTicketsByMonthChart's lifecycle-event counts, so stacking is correct here). */
export function ReembolsosByMonthChart({ rows, formatValue }: ReembolsosByMonthChartProps) {
  const byMes = new Map<number, Record<string, number>>();
  for (const row of rows) {
    const entry = byMes.get(row.mes) ?? {};
    entry[row.bucket] = (entry[row.bucket] ?? 0) + row.monto;
    byMes.set(row.mes, entry);
  }

  const data = Array.from(byMes.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([mes, buckets]) => ({ key: String(mes), ...buckets }));

  const presentBuckets = BUCKET_ORDER.filter((bucket) => rows.some((r) => r.bucket === bucket));

  return (
    <>
      <div className={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="none" vertical={false} />
            <XAxis
              dataKey="key"
              tickFormatter={formatMonthLabel}
              tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--chart-axis)' }}
              tickLine={false}
              interval={0}
            />
            <YAxis tickFormatter={formatValue} tick={{ fill: 'var(--chart-muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
            <Tooltip
              cursor={{ fill: 'var(--color-primary-soft)' }}
              content={
                <StackedChartTooltip
                  formatLabel={formatMonthLabel}
                  formatValue={formatValue}
                  seriesLabel={(key) => BUCKET_LABELS[key as ReembolsoBucket] ?? key}
                />
              }
            />
            {presentBuckets.map((bucket, index) => (
              <Bar
                key={bucket}
                dataKey={bucket}
                name={bucket}
                stackId="reembolsos"
                fill={BUCKET_COLORS[bucket]}
                radius={index === presentBuckets.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                maxBarSize={36}
                animationDuration={450}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.legendRow}>
        {presentBuckets.map((bucket) => (
          <span className={styles.legendItem} key={bucket}>
            <span className={styles.legendSwatch} style={{ backgroundColor: BUCKET_COLORS[bucket] }} aria-hidden="true" />
            {BUCKET_LABELS[bucket]}
          </span>
        ))}
      </div>
    </>
  );
}
