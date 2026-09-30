import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MarketingSalesByMonthRow } from '../../api/types';
import { StackedChartTooltip } from './StackedChartTooltip';
import styles from './charts.module.css';

interface MarketingSalesChartProps {
  rows: MarketingSalesByMonthRow[];
  formatValue: (value: number) => string;
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatMonthKey(key: string): string {
  const [anio, mes] = key.split('-');
  const monthLabel = MONTH_LABELS[Number(mes) - 1] ?? mes;
  return `${monthLabel} ${anio}`;
}

const SERIES_LABELS: Record<string, string> = { online: 'Online', offline: 'Offline' };

/**
 * Sales (Prospecto rows with a matched Contrato) per year/month, stacked online/offline - same
 * "one hue vs. neutral" binary-split convention this app already uses for HR's Activos/Inactivos
 * and Female/Male charts (var(--color-primary) vs var(--color-neutral-800)), not two arbitrary
 * hues - see HrBarChart.tsx / hrAnalytics.ts's STATUS_COLORS/GENDER_COLORS.
 */
export function MarketingSalesChart({ rows, formatValue }: MarketingSalesChartProps) {
  const data = rows.map((row) => ({ key: `${row.anio}-${row.mes}`, online: row.online, offline: row.offline }));

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
            <Bar dataKey="online" name="online" stackId="ventas" fill="var(--color-primary)" radius={[0, 0, 0, 0]} maxBarSize={28} animationDuration={450} />
            <Bar
              dataKey="offline"
              name="offline"
              stackId="ventas"
              fill="var(--color-neutral-800)"
              radius={[6, 6, 0, 0]}
              maxBarSize={28}
              animationDuration={450}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.legendRow}>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ backgroundColor: 'var(--color-primary)' }} aria-hidden="true" />
          Online
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ backgroundColor: 'var(--color-neutral-800)' }} aria-hidden="true" />
          Offline
        </span>
      </div>
    </>
  );
}
