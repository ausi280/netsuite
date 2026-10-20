import { LoadingState } from '../common/LoadingState';
import { ErrorState } from '../common/ErrorState';
import { EmptyState } from '../common/EmptyState';
import { PostventaByMonthChart } from '../charts/PostventaByMonthChart';
import { PostventaByOwnerChart } from '../charts/PostventaByOwnerChart';
import { PostventaResueltosByMonthChart } from '../charts/PostventaResueltosByMonthChart';
import chartStyles from '../charts/charts.module.css';
import { useMarketingTickets } from '../../hooks/useMarketingTickets';
import tileStyles from '../../pages/PostventaReportPage.module.css';
import styles from '../../pages/MarketingReportPage.module.css';

const countFormatter = new Intl.NumberFormat('es-MX');
const formatCount = (v: number) => countFormatter.format(v);

/**
 * Marketing team requests from Zammad (group "Marketing" - diseño, branding, contenido...) for the
 * report's date range, by creation date: the same status tiles and charts as the Postventa report,
 * built from the same backend logic (api/src-ts/reporting/postventaRepository.ts with group =
 * "Marketing"). Differences: Cerrado and Resuelto are shown as one combined green "Cerrados /
 * Resueltos" bucket (tile, monthly chart and the by-close-date chart), and the by-asunto chart is
 * not shown (not needed by the Marketing team).
 */
export function MarketingTicketsSection({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data, isLoading, isError, error, refetch } = useMarketingTickets(dateFrom, dateTo);

  return (
    <div className={chartStyles.chartCard}>
      <h2 className={styles.panelTitle}>Tickets de Marketing (Zammad)</h2>
      <p className={styles.panelSubtitle}>
        Solicitudes al equipo de Marketing por fecha de creación, todas las empresas - mismos estatus que el reporte de Postventa.
      </p>

      {isLoading && !data ? <LoadingState label="Cargando tickets de marketing..." /> : null}
      {isError ? (
        <ErrorState message={error instanceof Error ? error.message : 'No se pudieron cargar los tickets de marketing.'} onRetry={() => refetch()} />
      ) : null}

      {data ? (
        data.byMonth.length === 0 ? (
          <EmptyState message="No hay tickets de Marketing en este periodo." />
        ) : (
          <>
            <div className={tileStyles.grid}>
              <div className={`${tileStyles.tile} ${tileStyles.nuevo}`}>
                <p className={tileStyles.value}>{formatCount(data.summary.nuevos)}</p>
                <p className={tileStyles.label}>Nuevos</p>
                <p className={tileStyles.hint}>Sin dueño asignado</p>
              </div>
              <div className={`${tileStyles.tile} ${tileStyles.enProceso}`}>
                <p className={tileStyles.value}>{formatCount(data.summary.enProceso)}</p>
                <p className={tileStyles.label}>En Proceso</p>
                <p className={tileStyles.hint}>Con dueño, aún abiertos</p>
              </div>
              <div className={`${tileStyles.tile} ${tileStyles.resuelto}`}>
                <p className={tileStyles.value}>{formatCount(data.summary.cerrados + data.summary.resueltos)}</p>
                <p className={tileStyles.label}>Cerrados / Resueltos</p>
              </div>
            </div>

            <div className={styles.splitGrid}>
              <div>
                <h3 className={styles.splitTitle}>Tickets por mes</h3>
                <PostventaByMonthChart rows={data.byMonth} formatValue={formatCount} mergeClosed />
              </div>
              <div>
                <h3 className={styles.splitTitle}>Cerrados / Resueltos por mes (fecha de cierre)</h3>
                {data.cerradosByMonth.length === 0 ? (
                  <EmptyState message="No hay tickets cerrados en este periodo." />
                ) : (
                  <PostventaResueltosByMonthChart
                    rows={data.cerradosByMonth}
                    formatValue={formatCount}
                    metricName="Cerrados / Resueltos"
                    color="var(--status-good)"
                  />
                )}
              </div>
              <div>
                <h3 className={styles.splitTitle}>Tickets por agente</h3>
                <PostventaByOwnerChart rows={data.byOwner} formatValue={formatCount} />
              </div>
            </div>
          </>
        )
      ) : null}
    </div>
  );
}
