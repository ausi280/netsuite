import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PostventaOwnerRow } from '../../api/types';
import { StackedChartTooltip } from './StackedChartTooltip';
import styles from './charts.module.css';

interface PostventaByOwnerChartProps {
  rows: PostventaOwnerRow[];
  formatValue: (value: number) => string;
}

// Same series keys/labels/colors as PostventaByMonthChart (and the page's status tiles), so a
// status reads the same color in every Postventa chart.
const SERIES = ['nuevos', 'enProceso', 'cerrados', 'resueltos'] as const;
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

const ROW_HEIGHT = 44;

/** Postventa tickets per agent (owner), stacked by status - one horizontal bar per person (names
 * read better on the y-axis), plus a "Sin asignar" bar for unassigned tickets. Total labeled at
 * each bar's end. */
export function PostventaByOwnerChart({ rows, formatValue }: PostventaByOwnerChartProps) {
  const data = rows.map((row) => ({ ...row, key: row.owner_label }));

  return (
    <>
      <div style={{ width: '100%', height: data.length * ROW_HEIGHT + 40 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 40, left: 8, bottom: 0 }}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="none" horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              tickFormatter={formatValue}
              tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--chart-axis)' }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="key"
              width={150}
              interval={0}
              tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--color-primary-soft)' }}
              content={<StackedChartTooltip formatLabel={(label) => label} formatValue={formatValue} seriesLabel={(key) => SERIES_LABELS[key] ?? key} />}
            />
            {SERIES.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                name={key}
                stackId="estado"
                fill={SERIES_COLORS[key]}
                radius={index === SERIES.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
                maxBarSize={24}
                animationDuration={450}
              >
                {index === SERIES.length - 1 ? (
                  <LabelList
                    dataKey="total"
                    position="right"
                    formatter={(value: unknown) => formatValue(Number(value ?? 0))}
                    style={{ fill: 'var(--color-neutral-800)', fontSize: 12, fontWeight: 600 }}
                  />
                ) : null}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.legendRow}>
        {SERIES.map((key) => (
          <span className={styles.legendItem} key={key}>
            <span className={styles.legendSwatch} style={{ backgroundColor: SERIES_COLORS[key] }} aria-hidden="true" />
            {SERIES_LABELS[key]}
          </span>
        ))}
      </div>
    </>
  );
}
