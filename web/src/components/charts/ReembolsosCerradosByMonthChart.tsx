import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ReembolsoCierreMonthRow } from '../../api/types';
import { ChartTooltip } from './ChartTooltip';
import styles from './charts.module.css';

interface ReembolsosCerradosByMonthChartProps {
  rows: ReembolsoCierreMonthRow[];
  formatValue: (value: number) => string;
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatMonthKey(key: string): string {
  const [anio, mes] = key.split('-');
  const monthLabel = MONTH_LABELS[Number(mes) - 1] ?? mes;
  return `${monthLabel} ${anio}`;
}

/** Number of reembolsos closed per year/month of their own fecha cierre - a single-series count,
 * same "one series -> one color" convention as PostventaResueltosByMonthChart/ComercialTareasChart.
 * The matching monto total is shown as a text stat alongside this chart (see
 * PostventaReportPage.tsx) rather than as a second series/axis here - a count and a currency total
 * are different units, and this app never does dual-axis charts (see the dataviz skill's
 * anti-patterns). */
export function ReembolsosCerradosByMonthChart({ rows, formatValue }: ReembolsosCerradosByMonthChartProps) {
  const data = rows.map((row) => ({ key: `${row.anio}-${row.mes}`, cantidad: row.cantidad }));

  return (
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
            content={<ChartTooltip formatLabel={formatMonthKey} formatValue={formatValue} metricName="Cerrados" />}
          />
          <Bar dataKey="cantidad" fill="var(--color-primary)" radius={[6, 6, 0, 0]} maxBarSize={36} animationDuration={450}>
            <LabelList
              dataKey="cantidad"
              position="top"
              formatter={(value: unknown) => formatValue(Number(value ?? 0))}
              style={{ fill: 'var(--color-neutral-800)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
