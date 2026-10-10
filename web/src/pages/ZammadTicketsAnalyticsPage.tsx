import { useMemo, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { ZammadTicketsByMonthChart } from '../components/charts/ZammadTicketsByMonthChart';
import chartStyles from '../components/charts/charts.module.css';
import { useZammadTicketsByMonth } from '../hooks/useZammadTicketsByMonth';
import styles from './CommissionsPage.module.css';

const countFormatter = new Intl.NumberFormat('es-MX');

/**
 * Zammad Tickets "Ver gráficos" - every group (not just Postventa, see PostventaReportPage.tsx for
 * that bespoke, group-scoped report). One chart: tickets per month for each of the three lifecycle
 * dates shown in the grid (creación, primera atención, cierre) - see
 * ZammadTicketsByMonthChart.tsx for why these render as grouped, not stacked, bars.
 */
export function ZammadTicketsAnalyticsPage() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filters = useMemo(() => ({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }), [dateFrom, dateTo]);
  const byMonthQuery = useZammadTicketsByMonth(filters);

  return (
    <AppShell
      breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: 'Tickets Zammad', to: '/reports/zammad-tickets' }, { label: 'Gráficos' }]}
    >
      <div className={styles.heading}>
        <div>
          <h1 className={styles.title}>Gráficos de Tickets Zammad</h1>
          <p className={styles.subtitle}>Tickets por mes de creación, primera atención y cierre - todos los grupos.</p>
        </div>
      </div>

      <div className={styles.filters}>
        <input
          type="date"
          className={styles.select}
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(event) => setDateFrom(event.target.value)}
          aria-label="Desde"
        />
        <input
          type="date"
          className={styles.select}
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(event) => setDateTo(event.target.value)}
          aria-label="Hasta"
        />
      </div>

      <div className={chartStyles.chartCard}>
        <h2 className={styles.title} style={{ fontSize: 18 }}>
          Tickets por mes
        </h2>
        {byMonthQuery.isLoading ? (
          <LoadingState label="Cargando tickets por mes..." />
        ) : byMonthQuery.isError ? (
          <ErrorState
            message={byMonthQuery.error instanceof Error ? byMonthQuery.error.message : 'No se pudo cargar el gráfico.'}
            onRetry={() => byMonthQuery.refetch()}
          />
        ) : (byMonthQuery.data ?? []).length === 0 ? (
          <EmptyState message="No hay tickets en este periodo." />
        ) : (
          <ZammadTicketsByMonthChart rows={byMonthQuery.data ?? []} formatValue={(v) => countFormatter.format(v)} />
        )}
      </div>
    </AppShell>
  );
}
