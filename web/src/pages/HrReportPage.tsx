import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { HrTrendChart } from '../components/charts/HrTrendChart';
import { HrBarChart } from '../components/charts/HrBarChart';
import { HrChartTable } from '../components/charts/HrChartTable';
import chartStyles from '../components/charts/charts.module.css';
import { hrDimensions, getHrDimensionConfig } from '../config/hrAnalytics';
import { useHrAnalytics } from '../hooks/useHrAnalytics';
import { useHrSummary } from '../hooks/useHrSummary';
import type { HrDimension } from '../api/types';
import styles from './HrReportPage.module.css';

const countFormatter = new Intl.NumberFormat('es-MX');

export function HrReportPage() {
  const [dimension, setDimension] = useState<HrDimension>('status');
  // Defaults to active-only (current org headcount) - the toggle below reveals everyone ever
  // synced, including terminated staff, for the dimensions where that history is meaningful.
  const [activeOnly, setActiveOnly] = useState(true);

  const summaryQuery = useHrSummary();
  const config = getHrDimensionConfig(dimension);
  const { data, isLoading, isError, error, refetch } = useHrAnalytics(dimension, activeOnly);

  const metricLabel = 'Colaboradores';
  const formatValue = (v: number) => countFormatter.format(v);

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: 'HR Report' }]}>
      <div className={styles.heading}>
        <h1 className={styles.title}>HR Report</h1>
        <p className={styles.subtitle}>Headcount por marca, departamento, género, país, edad y antigüedad.</p>
      </div>

      {summaryQuery.data ? (
        <div className={styles.summaryBar}>
          <div className={styles.summaryStat}>
            <span className={styles.summaryValue}>{countFormatter.format(summaryQuery.data.total)}</span>
            <span className={styles.summaryLabel}>Total histórico</span>
          </div>
          <div className={styles.summaryDivider} />
          <div className={styles.summaryStat}>
            <span className={styles.summaryValue}>{countFormatter.format(summaryQuery.data.active)}</span>
            <span className={styles.summaryLabel}>Activos</span>
          </div>
          <div className={styles.summaryDivider} />
          <div className={styles.summaryStat}>
            <span className={styles.summaryValue}>{countFormatter.format(summaryQuery.data.inactive)}</span>
            <span className={styles.summaryLabel}>Inactivos</span>
          </div>
        </div>
      ) : null}

      <div className={styles.controls}>
        <div className={styles.tabs} role="tablist" aria-label="Vista de gráfico">
          {hrDimensions.map((d) => (
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

        {dimension !== 'status' ? (
          <div className={styles.metricToggle} role="group" aria-label="Filtro">
            <button
              type="button"
              className={`${styles.metricButton} ${activeOnly ? styles.metricButtonActive : ''}`}
              onClick={() => setActiveOnly(true)}
            >
              Activos
            </button>
            <button
              type="button"
              className={`${styles.metricButton} ${!activeOnly ? styles.metricButtonActive : ''}`}
              onClick={() => setActiveOnly(false)}
            >
              Todos
            </button>
          </div>
        ) : null}
      </div>

      {isLoading && !data ? <LoadingState label="Cargando gráfico..." /> : null}
      {isError ? (
        <ErrorState message={error instanceof Error ? error.message : 'No se pudo cargar el gráfico.'} onRetry={() => refetch()} />
      ) : null}
      {!isError && data ? (
        data.length === 0 ? (
          <EmptyState message="No hay datos para esta vista." />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${dimension}-${activeOnly}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className={chartStyles.chartCard}>
                {config.chartType === 'trend' ? (
                  <HrTrendChart rows={data} metricLabel={metricLabel} formatLabel={config.keyLabel} formatValue={formatValue} />
                ) : (
                  <HrBarChart rows={data} metricLabel={metricLabel} dimension={config} formatValue={formatValue} />
                )}
                <HrChartTable rows={data} formatLabel={config.keyLabel} formatCount={formatValue} />
              </div>
            </motion.div>
          </AnimatePresence>
        )
      ) : null}
    </AppShell>
  );
}
