import { useState } from 'react';
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
import type { PartidaDimension } from '../api/types';
import styles from './PartidaAnalyticsPage.module.css';

type Metric = 'count' | 'sum';

const countFormatter = new Intl.NumberFormat('es-MX');
const countCompactFormatter = new Intl.NumberFormat('es-MX', { notation: 'compact' });
const sumFormatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const sumCompactFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

// "Por Mes" spans years of historical/backfilled data (some months are bulk-import outliers) -
// defaulting to the most recent window keeps the trend actually readable.
const RECENT_MONTHS = 12;

export function PartidaAnalyticsPage() {
  const [dimension, setDimension] = useState<PartidaDimension>('month');
  const [metric, setMetric] = useState<Metric>('count');

  const config = getDimensionConfig(dimension);
  const { data, isLoading, isError, error, refetch } = usePartidaAnalytics(dimension);

  const rows = dimension === 'month' ? (data ?? []).slice(-RECENT_MONTHS) : (data ?? []);

  const formatValue = metric === 'count' ? (v: number) => countFormatter.format(v) : (v: number) => sumFormatter.format(v);
  const formatAxisValue = metric === 'count' ? (v: number) => countCompactFormatter.format(v) : (v: number) => sumCompactFormatter.format(v);
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

      <div className={chartStyles.chartCard}>
        {isLoading && !data ? <LoadingState label="Cargando gráfico..." /> : null}
        {isError ? (
          <ErrorState message={error instanceof Error ? error.message : 'No se pudo cargar el gráfico.'} onRetry={() => refetch()} />
        ) : null}
        {!isError && data ? (
          rows.length === 0 ? (
            <EmptyState message="No hay datos para esta vista." />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${dimension}-${metric}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                {config.chartType === 'trend' ? (
                  <PartidaTrendChart
                    rows={rows}
                    metric={metric}
                    metricLabel={metricLabel}
                    formatLabel={config.keyLabel}
                    formatValue={formatValue}
                    formatAxisValue={formatAxisValue}
                  />
                ) : (
                  <PartidaBarChart
                    rows={rows}
                    metric={metric}
                    metricLabel={metricLabel}
                    dimension={config}
                    formatValue={formatValue}
                    formatAxisValue={formatAxisValue}
                  />
                )}
                <ChartTable
                  rows={rows}
                  formatLabel={config.keyLabel}
                  formatCount={(v) => countFormatter.format(v)}
                  formatSum={(v) => sumFormatter.format(v)}
                />
              </motion.div>
            </AnimatePresence>
          )
        ) : null}
      </div>
    </AppShell>
  );
}
