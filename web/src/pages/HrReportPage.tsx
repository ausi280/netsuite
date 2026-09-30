import { useMemo, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { HrTrendChart } from '../components/charts/HrTrendChart';
import { HrBarChart } from '../components/charts/HrBarChart';
import { HrDonutChart } from '../components/charts/HrDonutChart';
import { HrChartTable } from '../components/charts/HrChartTable';
import chartStyles from '../components/charts/charts.module.css';
import { hrDimensions, getHrDimensionConfig, type HrDimensionConfig } from '../config/hrAnalytics';
import { useHrAnalytics } from '../hooks/useHrAnalytics';
import { useHrSummary } from '../hooks/useHrSummary';
import styles from './HrReportPage.module.css';

const countFormatter = new Intl.NumberFormat('es-MX');
const formatValue = (v: number) => countFormatter.format(v);
const METRIC_LABEL = 'Colaboradores';

// Every dimension except 'hiremonth' renders as a plain breakdown panel (bar or donut) - hiremonth
// is the one true time series (see hrAnalyticsRepository.ts), so it gets its own panel with a year
// filter instead, rendered full-width at the end of the grid.
const GRID_DIMENSIONS = hrDimensions.filter((d) => d.key !== 'hiremonth');

interface HrDimensionPanelProps {
  config: HrDimensionConfig;
  activeOnly: boolean;
}

/** One breakdown dimension (brand/department/gender/country/age/seniority/status), always visible
 * side by side with the others - no more tab-switching between them. */
function HrDimensionPanel({ config, activeOnly }: HrDimensionPanelProps) {
  const { data, isLoading, isError, error, refetch } = useHrAnalytics(config.key, activeOnly);

  return (
    <div className={`${chartStyles.chartCard} ${config.wide ? styles.gridWide : ''}`}>
      <h2 className={styles.panelTitle}>{config.label}</h2>
      {isLoading && !data ? <LoadingState label="Cargando..." /> : null}
      {isError ? (
        <ErrorState message={error instanceof Error ? error.message : 'No se pudo cargar el gráfico.'} onRetry={() => refetch()} />
      ) : null}
      {!isError && data ? (
        data.length === 0 ? (
          <EmptyState message="No hay datos para esta vista." />
        ) : (
          <>
            {config.chartType === 'donut' ? (
              <HrDonutChart rows={data} metricLabel={METRIC_LABEL} dimension={config} formatValue={formatValue} />
            ) : (
              <HrBarChart rows={data} metricLabel={METRIC_LABEL} dimension={config} formatValue={formatValue} />
            )}
            <HrChartTable rows={data} formatLabel={config.keyLabel} formatCount={formatValue} />
          </>
        )
      ) : null}
    </div>
  );
}

/** "Contrataciones por Mes" - hires by hiring_date, the only real month-over-month trend this
 * snapshot table supports (not a headcount-over-time reconstruction - see hrAnalyticsRepository.ts
 * for why that isn't possible with the data currently synced). The year tabs are this panel's
 * "expanded display year and dates" - the other panels have no date axis to expand. */
function HrHiremonthPanel({ activeOnly }: { activeOnly: boolean }) {
  const config = getHrDimensionConfig('hiremonth');
  const { data, isLoading, isError, error, refetch } = useHrAnalytics('hiremonth', activeOnly);
  const [year, setYear] = useState<'all' | number>('all');

  const years = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.map((row) => Number(row.key.slice(0, 4))))).sort((a, b) => a - b);
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    if (year === 'all') return data;
    return data.filter((row) => Number(row.key.slice(0, 4)) === year);
  }, [data, year]);

  return (
    <div className={`${chartStyles.chartCard} ${styles.gridWide}`}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{config.label}</h2>
        {years.length > 1 ? (
          <div className={styles.yearTabs} role="tablist" aria-label="Año">
            <button type="button" className={`${styles.yearTab} ${year === 'all' ? styles.yearTabActive : ''}`} onClick={() => setYear('all')}>
              Todos
            </button>
            {years.map((y) => (
              <button key={y} type="button" className={`${styles.yearTab} ${year === y ? styles.yearTabActive : ''}`} onClick={() => setYear(y)}>
                {y}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {isLoading && !data ? <LoadingState label="Cargando..." /> : null}
      {isError ? (
        <ErrorState message={error instanceof Error ? error.message : 'No se pudo cargar el gráfico.'} onRetry={() => refetch()} />
      ) : null}
      {!isError && data ? (
        rows.length === 0 ? (
          <EmptyState message="No hay datos para este año." />
        ) : (
          <>
            <HrTrendChart rows={rows} metricLabel={METRIC_LABEL} formatLabel={config.keyLabel} formatValue={formatValue} />
            <HrChartTable rows={rows} formatLabel={config.keyLabel} formatCount={formatValue} />
          </>
        )
      ) : null}
    </div>
  );
}

export function HrReportPage() {
  // Defaults to active-only (current org headcount) - the toggle reveals everyone ever synced,
  // including terminated staff, across every panel at once ('status' ignores it server-side, since
  // it exists specifically to show the active/inactive split).
  const [activeOnly, setActiveOnly] = useState(true);
  const summaryQuery = useHrSummary();

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
            <span className={`${styles.summaryValue} ${styles.summaryValueEmphasis}`}>{countFormatter.format(summaryQuery.data.active)}</span>
            <span className={styles.summaryLabel}>Active Headcount</span>
          </div>
          <div className={styles.summaryDivider} />
          <div className={styles.summaryStat}>
            <span className={styles.summaryValue}>{countFormatter.format(summaryQuery.data.inactive)}</span>
            <span className={styles.summaryLabel}>Inactivos</span>
          </div>
        </div>
      ) : null}

      <div className={styles.controls}>
        <div className={styles.metricToggle} role="group" aria-label="Filtro">
          <button type="button" className={`${styles.metricButton} ${activeOnly ? styles.metricButtonActive : ''}`} onClick={() => setActiveOnly(true)}>
            Activos
          </button>
          <button type="button" className={`${styles.metricButton} ${!activeOnly ? styles.metricButtonActive : ''}`} onClick={() => setActiveOnly(false)}>
            Todos
          </button>
        </div>
      </div>

      <div className={styles.dashboardGrid}>
        {GRID_DIMENSIONS.map((d) => (
          <HrDimensionPanel key={d.key} config={d} activeOnly={activeOnly} />
        ))}
        <HrHiremonthPanel activeOnly={activeOnly} />
      </div>
    </AppShell>
  );
}
