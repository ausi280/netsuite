import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PostventaAsuntoRow } from '../../api/types';
import { StackedChartTooltip } from './StackedChartTooltip';
import styles from './charts.module.css';

interface PostventaByAsuntoChartProps {
  rows: PostventaAsuntoRow[];
  formatValue: (value: number) => string;
}

// Same fixed categorical palette hrAnalytics.ts's CATEGORY_PALETTE uses, assigned to agents in a
// stable (alphabetical) order - never by rank, so an agent keeps their color as counts change.
// "Sin asignar" isn't a person, so it always takes the recessive neutral instead.
const AGENT_PALETTE = [
  'var(--color-primary)',
  'var(--color-secondary)',
  'var(--color-neutral-800)',
  'var(--color-primary-tint1)',
  'var(--color-secondary-tint1)',
  'var(--color-primary-tint2)',
  'var(--color-secondary-tint2)',
  'var(--color-primary-tint3)',
];
const SIN_ASIGNAR = 'Sin asignar';
const SIN_ASIGNAR_COLOR = 'var(--color-neutral-300)';
const TOTAL_KEY = '__total';
// A zero-height series stacked last on every bar, purely to carry the total label - labeling the
// last agent series instead would drop the total on any asunto that agent has no tickets for.
const CAP_KEY = '__cap';

/** Postventa ticket counts by (normalized) asunto across the whole filtered range, each bar
 * stacked by agent (owner) - "which motivos dominate, and who's handling them". Rows arrive
 * pre-sorted descending by count from the backend; the total is labeled on top of each bar. */
export function PostventaByAsuntoChart({ rows, formatValue }: PostventaByAsuntoChartProps) {
  const agentes = Array.from(new Set(rows.flatMap((row) => row.por_agente.map((a) => a.agente)))).sort((a, b) =>
    a === SIN_ASIGNAR ? 1 : b === SIN_ASIGNAR ? -1 : a.localeCompare(b),
  );
  const colorOf = (agente: string, index: number) => (agente === SIN_ASIGNAR ? SIN_ASIGNAR_COLOR : AGENT_PALETTE[index % AGENT_PALETTE.length]);

  // Recharts keys series by dataKey - prefixed so an agent label can never collide with "key".
  const data = rows.map((row) => ({
    key: row.asunto,
    [TOTAL_KEY]: row.cantidad,
    [CAP_KEY]: 0,
    ...Object.fromEntries(row.por_agente.map((a) => [`a:${a.agente}`, a.cantidad])),
  }));

  return (
    <>
      <div className={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="none" vertical={false} />
            <XAxis
              dataKey="key"
              tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--chart-axis)' }}
              tickLine={false}
              interval={0}
              angle={data.length > 3 ? -20 : 0}
              textAnchor={data.length > 3 ? 'end' : 'middle'}
              height={data.length > 3 ? 64 : 30}
            />
            <YAxis
              allowDecimals={false}
              tickFormatter={formatValue}
              tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ fill: 'var(--color-primary-soft)' }}
              content={
                <StackedChartTooltip formatLabel={(label) => label} formatValue={formatValue} seriesLabel={(key) => key.replace(/^a:/, '')} />
              }
            />
            {agentes.map((agente, index) => (
              <Bar
                key={agente}
                dataKey={`a:${agente}`}
                name={agente}
                stackId="agente"
                fill={colorOf(agente, index)}
                maxBarSize={48}
                animationDuration={450}
              />
            ))}
            <Bar dataKey={CAP_KEY} stackId="agente" fill="transparent" tooltipType="none" legendType="none" maxBarSize={48} isAnimationActive={false}>
              <LabelList
                dataKey={TOTAL_KEY}
                position="top"
                formatter={(value: unknown) => formatValue(Number(value ?? 0))}
                style={{ fill: 'var(--color-neutral-900)', fontSize: 12 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.legendRow}>
        {agentes.map((agente, index) => (
          <span className={styles.legendItem} key={agente}>
            <span className={styles.legendSwatch} style={{ backgroundColor: colorOf(agente, index) }} aria-hidden="true" />
            {agente}
          </span>
        ))}
      </div>
    </>
  );
}
