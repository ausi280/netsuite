import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { PartidaTrendChart } from '../components/charts/PartidaTrendChart';
import { PartidaBarChart } from '../components/charts/PartidaBarChart';
import { ChartTable } from '../components/charts/ChartTable';
import chartStyles from '../components/charts/charts.module.css';
import { partidaDimensions, getDimensionConfig } from '../config/partidaAnalytics';
import { usePartidaAnalytics } from '../hooks/usePartidaAnalytics';
import { currencyIsoCode, currencyLabel } from '../config/currencies';
import type { PartidaBreakdownRow, PartidaDimension } from '../api/types';
import styles from './PartidaAnalyticsPage.module.css';

type Metric = 'count' | 'sum';

const countFormatter = new Intl.NumberFormat('es-MX');
const countCompactFormatter = new Intl.NumberFormat('es-MX', { notation: 'compact' });

// Partidas are denominated in MXN/USD/EUR/COP/ARS/PEN/BRL - each currency gets its own panel with
// its own correctly-scaled formatter, rather than one blended (and misleading) total.
function buildSumFormatters(currencyId: string) {
  const isoCode = currencyIsoCode(currencyId);
  if (!isoCode) {
    return {
      sumFormatter: new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }),
      sumCompactFormatter: new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }),
    };
  }
  return {
    sumFormatter: new Intl.NumberFormat('es-MX', { style: 'currency', currency: isoCode, maximumFractionDigits: 0 }),
    sumCompactFormatter: new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: isoCode,
      notation: 'compact',
      maximumFractionDigits: 1,
    }),
  };
}

// "Por Mes" spans years of historical/backfilled data (some months are bulk-import outliers) -
// defaulting to the most recent window keeps the trend actually readable.
const RECENT_MONTHS = 12;

interface CurrencyGroup {
  currencyId: string;
  label: string;
  rows: PartidaBreakdownRow[];
}

/** Splits the flat (dimension x currency) rows back into one sorted, sliced row-set per currency,
 * ordered by total partida count descending so the most active currency's panel shows first. */
function groupByCurrency(data: PartidaBreakdownRow[] | undefined, dimension: PartidaDimension): CurrencyGroup[] {
  if (!data) return [];

  const byCurrency = new Map<string, PartidaBreakdownRow[]>();
  for (const row of data) {
    const currencyId = row.currency ?? '';
    const rows = byCurrency.get(currencyId);
    if (rows) {
      rows.push(row);
    } else {
      byCurrency.set(currencyId, [row]);
    }
  }

  const groups = Array.from(byCurrency.entries()).map(([currencyId, rows]) => {
    const sorted = [...rows].sort(
      dimension === 'month' ? (a, b) => a.key.localeCompare(b.key) : (a, b) => b.sum - a.sum,
    );
    const sliced = dimension === 'month' ? sorted.slice(-RECENT_MONTHS) : sorted;
    return {
      currencyId,
      label: currencyId ? currencyLabel(currencyId) : 'Sin moneda registrada',
      rows: sliced,
    };
  });

  return groups.sort((a, b) => {
    const totalA = a.rows.reduce((sum, row) => sum + row.count, 0);
    const totalB = b.rows.reduce((sum, row) => sum + row.count, 0);
    return totalB - totalA;
  });
}

export function PartidaAnalyticsPage() {
  const [dimension, setDimension] = useState<PartidaDimension>('month');
  const [metric, setMetric] = useState<Metric>('count');

  const config = getDimensionConfig(dimension);
  const { data, isLoading, isError, error, refetch } = usePartidaAnalytics(dimension);

  const groups = useMemo(() => groupByCurrency(data, dimension), [data, dimension]);
  const metricLabel = metric === 'count' ? 'Partidas' : 'Monto';

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: 'Partidas', to: '/reports/partidas' }, { label: 'Gráficos' }]}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Gráficos de Partidas</h1>
      </div>

      <div className={styles.controls}>
        <div className={styles.tabs} role="tablist" aria-label="Vista de gráfico">
          {partidaDimensions.map((d) => (
            <button
              key={d.key}
              type="button"
              role="tab"
              aria-selected={dimension === d.key}
              className={`${styles.tab} ${dimension === d.key ? styles.tabActive : ''}`}
              onClick={() => setDimension(d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className={styles.metricToggle} role="group" aria-label="Métrica">
          <button
            type="button"
            className={`${styles.metricButton} ${metric === 'count' ? styles.metricButtonActive : ''}`}
            onClick={() => setMetric('count')}
          >
            Cantidad
          </button>
          <button
            type="button"
            className={`${styles.metricButton} ${metric === 'sum' ? styles.metricButtonActive : ''}`}
            onClick={() => setMetric('sum')}
          >
            Monto
          </button>
        </div>
      </div>

      {isLoading && !data ? <LoadingState label="Cargando gráfico..." /> : null}
      {isError ? (
        <ErrorState message={error instanceof Error ? error.message : 'No se pudo cargar el gráfico.'} onRetry={() => refetch()} />
      ) : null}
      {!isError && data ? (
        groups.length === 0 ? (
          <EmptyState message="No hay datos para esta vista." />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${dimension}-${metric}`}
              className={styles.currencyPanels}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              {groups.map((group) => {
                const { sumFormatter, sumCompactFormatter } = buildSumFormatters(group.currencyId);
                const formatValue = metric === 'count' ? (v: number) => countFormatter.format(v) : (v: number) => sumFormatter.format(v);
                const formatAxisValue =
                  metric === 'count' ? (v: number) => countCompactFormatter.format(v) : (v: number) => sumCompactFormatter.format(v);

                return (
                  <div className={chartStyles.chartCard} key={group.currencyId || 'sin-moneda'}>
                    <h2 className={styles.panelTitle}>{group.label}</h2>
                    {config.chartType === 'trend' ? (
                      <PartidaTrendChart
                        rows={group.rows}
                        metric={metric}
                        metricLabel={metricLabel}
                        formatLabel={config.keyLabel}
                        formatValue={formatValue}
                        formatAxisValue={formatAxisValue}
                      />
                    ) : (
                      <PartidaBarChart
                        rows={group.rows}
                        metric={metric}
                        metricLabel={metricLabel}
                        dimension={config}
                        formatValue={formatValue}
                        formatAxisValue={formatAxisValue}
                      />
                    )}
                    <ChartTable
                      rows={group.rows}
                      formatLabel={config.keyLabel}
                      formatCount={(v) => countFormatter.format(v)}
                      formatSum={(v) => sumFormatter.format(v)}
                    />
                  </div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        )
      ) : null}
    </AppShell>
  );
}
