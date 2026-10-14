import { useMemo, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { SimpleTable } from '../components/table/SimpleTable';
import type { SimpleColumn } from '../components/table/SimpleTable';
import { Pagination } from '../components/table/Pagination';
import { PostventaByMonthChart } from '../components/charts/PostventaByMonthChart';
import { PostventaByAsuntoChart } from '../components/charts/PostventaByAsuntoChart';
import { PostventaByOwnerChart } from '../components/charts/PostventaByOwnerChart';
import { PostventaResueltosByMonthChart } from '../components/charts/PostventaResueltosByMonthChart';
import { ReembolsosByMonthChart } from '../components/charts/ReembolsosByMonthChart';
import { ReembolsosByCausaChart } from '../components/charts/ReembolsosByCausaChart';
import { ReembolsosCerradosByMonthChart } from '../components/charts/ReembolsosCerradosByMonthChart';
import chartStyles from '../components/charts/charts.module.css';
import { usePostventaSummary } from '../hooks/usePostventaSummary';
import { usePostventaOwners } from '../hooks/usePostventaOwners';
import { usePostventaByMonth } from '../hooks/usePostventaByMonth';
import { usePostventaByAsunto } from '../hooks/usePostventaByAsunto';
import { usePostventaByOwner } from '../hooks/usePostventaByOwner';
import { usePostventaResueltosByMonth } from '../hooks/usePostventaResueltosByMonth';
import { usePostventaTickets } from '../hooks/usePostventaTickets';
import { useReembolsoEmpresas } from '../hooks/useReembolsoEmpresas';
import { useReembolsosByMonth } from '../hooks/useReembolsosByMonth';
import { useReembolsosByCausa } from '../hooks/useReembolsosByCausa';
import { useReembolsosCerradosByMonth } from '../hooks/useReembolsosCerradosByMonth';
import { useReembolsos } from '../hooks/useReembolsos';
import { fetchPostventaExportCsv, fetchReembolsosExportCsv } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';
import { downloadBlob } from '../utils/downloadBlob';
import { formatDateTime } from '../utils/format';
import type { PostventaEstado, PostventaTicketRow, ReembolsoBucket, ReembolsoRow } from '../api/types';
import styles from './CommissionsPage.module.css';
import tileStyles from './PostventaReportPage.module.css';

const countFormatter = new Intl.NumberFormat('es-MX');
const mxnFormatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const PAGE_SIZE = 25;

/** Local-time YYYY-MM-DD (not toISOString, which is UTC and can roll over to tomorrow in the evening). */
function toDateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// The page opens year to date (Jan 1 -> today); either bound can still be cleared for all-time.
const YEAR_START = toDateOnly(new Date(new Date().getFullYear(), 0, 1));
const TODAY = toDateOnly(new Date());
const REEMBOLSO_PAGE_SIZE = 25;

const REEMBOLSO_MONTH_LABELS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const REEMBOLSO_BUCKET_LABELS: Record<ReembolsoBucket, string> = {
  pendiente: 'Pendiente Reembolso',
  sinReembolso: 'Sin Reembolso',
  aplicadoTransferencia: 'Aplicado Transferencia',
  aplicadoAnualidades: 'Aplicado Anualidades',
  aplicadoNuevoContrato: 'Aplicado Nuevo Contrato',
  aplicadoGarantias: 'Aplicado Garantías',
  otro: 'Sin Clasificar',
};

const ESTADO_RESUMEN_LABELS: Record<PostventaEstado, string> = {
  nuevo: 'Nuevo',
  enProceso: 'En Proceso',
  cerrado: 'Cerrado',
  resuelto: 'Resuelto',
};

/**
 * Postventa status tiles - zammad_tickets rows in the "Postventa" group only, bucketed into
 * exactly one of four mutually-exclusive counts - see
 * api/src-ts/reporting/postventaRepository.ts for exactly how each is defined (in short: nuevos =
 * no owner and not yet cerrado/resuelto; en proceso = has an owner and not yet cerrado/resuelto;
 * cerrados/resueltos = that state, regardless of owner). Filterable by one owner and/or a date
 * range (the ticket's own creation date). The by-month chart and the detail table/export below the
 * tiles share the exact same filters and the exact same bucket classification (estadoResumen on
 * the backend), so all three can never disagree about where a ticket falls.
 *
 * One filter bar drives the whole page: the date range applies to both the tickets and the
 * Reembolsos section (on each reembolso's incidencia date), and so does the empresa filter (Cryo
 * empresa ids, mapped to Zammad's own empresa names server-side - see postventaRepository.ts). The
 * dueño filter only narrows tickets - Zammad agents have no counterpart in the Reembolsos data.
 */
export function PostventaReportPage() {
  const [dateFrom, setDateFrom] = useState(YEAR_START);
  const [dateTo, setDateTo] = useState(TODAY);
  const [ownerId, setOwnerId] = useState('');
  const [empresaId, setEmpresaId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { getAccessToken } = useApiToken();

  const filters = useMemo(
    () => ({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      ownerId: ownerId || undefined,
      empresaId: empresaId || undefined,
    }),
    [dateFrom, dateTo, ownerId, empresaId],
  );

  const ownersQuery = usePostventaOwners();
  const { data, isLoading, isError, error, refetch } = usePostventaSummary(filters);
  const byMonthQuery = usePostventaByMonth(filters);
  const byAsuntoQuery = usePostventaByAsunto(filters);
  const byOwnerQuery = usePostventaByOwner(filters);
  const resueltosByMonthQuery = usePostventaResueltosByMonth(filters);
  const ticketsQuery = usePostventaTickets({ ...filters, page, pageSize });

  const [reembolsoPage, setReembolsoPage] = useState(1);
  const [reembolsoPageSize, setReembolsoPageSize] = useState(REEMBOLSO_PAGE_SIZE);
  const [isExportingReembolsos, setIsExportingReembolsos] = useState(false);
  const [reembolsoExportError, setReembolsoExportError] = useState<string | null>(null);

  const reembolsoFilters = useMemo(
    () => ({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, empresaId: empresaId || undefined }),
    [dateFrom, dateTo, empresaId],
  );
  const reembolsoEmpresasQuery = useReembolsoEmpresas();
  const reembolsosByMonthQuery = useReembolsosByMonth(reembolsoFilters);
  const reembolsosByCausaQuery = useReembolsosByCausa(reembolsoFilters);
  const reembolsosCerradosByMonthQuery = useReembolsosCerradosByMonth(reembolsoFilters);
  const reembolsosQuery = useReembolsos({ ...reembolsoFilters, page: reembolsoPage, pageSize: reembolsoPageSize });

  function handleFilterChange(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
    setReembolsoPage(1);
  }

  function handlePageSizeChange(nextPageSize: number) {
    setPageSize(nextPageSize);
    setPage(1);
  }

  async function handleExport() {
    setIsExporting(true);
    setExportError(null);
    try {
      const token = await getAccessToken();
      const blob = await fetchPostventaExportCsv(token, filters);
      downloadBlob(blob, 'postventa.csv');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'No se pudo exportar el CSV.');
    } finally {
      setIsExporting(false);
    }
  }

  function handleReembolsoPageSizeChange(nextPageSize: number) {
    setReembolsoPageSize(nextPageSize);
    setReembolsoPage(1);
  }

  async function handleExportReembolsos() {
    setIsExportingReembolsos(true);
    setReembolsoExportError(null);
    try {
      const token = await getAccessToken();
      const blob = await fetchReembolsosExportCsv(token, reembolsoFilters);
      const range = [dateFrom, dateTo].filter(Boolean).join('_a_');
      downloadBlob(blob, range ? `reembolsos-${range}.csv` : 'reembolsos.csv');
    } catch (err) {
      setReembolsoExportError(err instanceof Error ? err.message : 'No se pudo exportar el CSV.');
    } finally {
      setIsExportingReembolsos(false);
    }
  }

  const columns: SimpleColumn<PostventaTicketRow>[] = [
    { key: 'number', header: 'Número', render: (r) => r.number || '—' },
    { key: 'title', header: 'Título', render: (r) => r.title || '—' },
    { key: 'asunto', header: 'Asunto', render: (r) => r.asunto || '—' },
    { key: 'estado_resumen', header: 'Estatus', render: (r) => ESTADO_RESUMEN_LABELS[r.estado_resumen] },
    { key: 'reembolso_estatus', header: 'Estatus Reembolso', render: (r) => (r.reembolso_estatus ? REEMBOLSO_BUCKET_LABELS[r.reembolso_estatus] : '—') },
    { key: 'owner_name', header: 'Dueño', render: (r) => r.owner_name || '—' },
    { key: 'customer_email', header: 'Cliente', render: (r) => r.customer_email || '—' },
    { key: 'foliocontrato', header: 'Folio Contrato', render: (r) => r.foliocontrato || '—' },
    { key: 'empresa', header: 'Empresa', render: (r) => r.empresa || '—' },
    { key: 'created_at_zammad', header: 'Fecha de Creación', render: (r) => formatDateTime(r.created_at_zammad) },
    { key: 'first_response_at_zammad', header: 'Fecha de Primera Atención', render: (r) => formatDateTime(r.first_response_at_zammad) },
    { key: 'close_at_zammad', header: 'Fecha de Cierre', render: (r) => formatDateTime(r.close_at_zammad) },
  ];

  const reembolsoColumns: SimpleColumn<ReembolsoRow>[] = [
    { key: 'folio', header: 'Folio', render: (r) => r.folio || '—' },
    { key: 'empresa', header: 'Empresa', render: (r) => r.empresa },
    { key: 'producto', header: 'Producto', render: (r) => r.producto },
    { key: 'causa', header: 'Causa', render: (r) => r.causa },
    { key: 'bucket', header: 'Estatus', render: (r) => REEMBOLSO_BUCKET_LABELS[r.bucket] },
    { key: 'mes', header: 'Mes', render: (r) => `${REEMBOLSO_MONTH_LABELS[r.mes - 1] ?? r.mes} ${r.anio}` },
    { key: 'monto', header: 'Monto', render: (r) => mxnFormatter.format(r.monto) },
  ];

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: 'Postventa' }]}>
      <div className={styles.heading}>
        <div>
          <h1 className={styles.title}>Postventa</h1>
          <p className={styles.subtitle}>Tickets de Postventa (Zammad), por estatus.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.actionButton} onClick={handleExport} disabled={isExporting}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="M7 10l5 5 5-5" />
              <path d="M4 20h16" />
            </svg>
            {isExporting ? 'Exportando...' : 'Exportar CSV'}
          </button>
        </div>
      </div>
      {exportError ? <p className={styles.exportError}>{exportError}</p> : null}

      <div className={styles.filters}>
        <input
          type="date"
          className={styles.select}
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(event) => handleFilterChange(setDateFrom, event.target.value)}
          aria-label="Desde"
        />
        <input
          type="date"
          className={styles.select}
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(event) => handleFilterChange(setDateTo, event.target.value)}
          aria-label="Hasta"
        />
        <select
          className={styles.select}
          value={ownerId}
          onChange={(event) => handleFilterChange(setOwnerId, event.target.value)}
          aria-label="Filtrar por dueño"
        >
          <option value="">Todos los dueños (tickets)</option>
          {(ownersQuery.data ?? []).map((owner) => (
            <option key={owner.owner_id} value={owner.owner_id}>
              {owner.owner_name}
            </option>
          ))}
        </select>
        <select
          className={styles.select}
          value={empresaId}
          onChange={(event) => handleFilterChange(setEmpresaId, event.target.value)}
          aria-label="Filtrar por empresa"
        >
          <option value="">Todas las empresas</option>
          {(reembolsoEmpresasQuery.data ?? []).map((empresa) => (
            <option key={empresa.empresa_id} value={empresa.empresa_id}>
              {empresa.nombre}
            </option>
          ))}
        </select>
      </div>

      {isLoading && !data ? <LoadingState label="Cargando reporte de postventa..." /> : null}
      {isError ? (
        <ErrorState message={error instanceof Error ? error.message : 'No se pudo cargar el reporte de postventa.'} onRetry={() => refetch()} />
      ) : null}

      {data ? (
        <div className={tileStyles.grid}>
          <div className={`${tileStyles.tile} ${tileStyles.nuevo}`}>
            <p className={tileStyles.value}>{countFormatter.format(data.nuevos)}</p>
            <p className={tileStyles.label}>Nuevos</p>
            <p className={tileStyles.hint}>Sin dueño asignado</p>
          </div>
          <div className={`${tileStyles.tile} ${tileStyles.enProceso}`}>
            <p className={tileStyles.value}>{countFormatter.format(data.enProceso)}</p>
            <p className={tileStyles.label}>En Proceso</p>
            <p className={tileStyles.hint}>Con dueño, aún abiertos</p>
          </div>
          <div className={`${tileStyles.tile} ${tileStyles.cerrado}`}>
            <p className={tileStyles.value}>{countFormatter.format(data.cerrados)}</p>
            <p className={tileStyles.label}>Cerrados</p>
          </div>
          <div className={`${tileStyles.tile} ${tileStyles.resuelto}`}>
            <p className={tileStyles.value}>{countFormatter.format(data.resueltos)}</p>
            <p className={tileStyles.label}>Resueltos</p>
          </div>
        </div>
      ) : null}

      <div className={tileStyles.chartStack}>
        <div className={chartStyles.chartCard}>
          <h2 className={styles.title} style={{ fontSize: 18 }}>
            Tickets por mes
          </h2>
          <p className={styles.subtitle}>Tickets de Postventa por mes de creación, por estatus.</p>
          {byMonthQuery.isLoading ? (
            <LoadingState label="Cargando tickets por mes..." />
          ) : (byMonthQuery.data ?? []).length === 0 ? (
            <EmptyState message="No hay tickets de Postventa en este periodo." />
          ) : (
            <PostventaByMonthChart rows={byMonthQuery.data ?? []} formatValue={(v) => countFormatter.format(v)} />
          )}
        </div>

        <div className={chartStyles.chartCard}>
          <h2 className={styles.title} style={{ fontSize: 18 }}>
            Tickets por Agente
          </h2>
          <p className={styles.subtitle}>Tickets de Postventa por agente asignado, por estatus, en el periodo seleccionado.</p>
          {byOwnerQuery.isLoading ? (
            <LoadingState label="Cargando tickets por agente..." />
          ) : (byOwnerQuery.data ?? []).length === 0 ? (
            <EmptyState message="No hay tickets de Postventa en este periodo." />
          ) : (
            <PostventaByOwnerChart rows={byOwnerQuery.data ?? []} formatValue={(v) => countFormatter.format(v)} />
          )}
        </div>

        <div className={chartStyles.chartCard}>
          <h2 className={styles.title} style={{ fontSize: 18 }}>
            Tickets por Asunto
          </h2>
          <p className={styles.subtitle}>Tickets de Postventa por asunto y agente, en el periodo seleccionado.</p>
          {byAsuntoQuery.isLoading ? (
            <LoadingState label="Cargando tickets por asunto..." />
          ) : (byAsuntoQuery.data ?? []).length === 0 ? (
            <EmptyState message="No hay tickets de Postventa en este periodo." />
          ) : (
            <PostventaByAsuntoChart rows={byAsuntoQuery.data ?? []} formatValue={(v) => countFormatter.format(v)} />
          )}
        </div>

        <div className={chartStyles.chartCard}>
          <h2 className={styles.title} style={{ fontSize: 18 }}>
            Tickets Resueltos por Mes
          </h2>
          <p className={styles.subtitle}>Tickets de Postventa marcados como Resueltos, por mes de su fecha de resolución.</p>
          {resueltosByMonthQuery.isLoading ? (
            <LoadingState label="Cargando tickets resueltos por mes..." />
          ) : (resueltosByMonthQuery.data ?? []).length === 0 ? (
            <EmptyState message="No hay tickets resueltos en este periodo." />
          ) : (
            <PostventaResueltosByMonthChart rows={resueltosByMonthQuery.data ?? []} formatValue={(v) => countFormatter.format(v)} />
          )}
        </div>

        <div className={chartStyles.chartCard}>
          <h2 className={styles.title} style={{ fontSize: 18 }}>
            Detalle
          </h2>
          {ticketsQuery.data ? (
            <p className={styles.subtitle}>{countFormatter.format(ticketsQuery.data.total)} tickets en el periodo.</p>
          ) : null}
          {ticketsQuery.isLoading ? <LoadingState label="Cargando tickets..." /> : null}
          {ticketsQuery.isError ? (
            <ErrorState
              message={ticketsQuery.error instanceof Error ? ticketsQuery.error.message : 'No se pudieron cargar los tickets.'}
              onRetry={() => ticketsQuery.refetch()}
            />
          ) : null}
          {!ticketsQuery.isLoading && !ticketsQuery.isError && ticketsQuery.data ? (
            ticketsQuery.data.data.length > 0 ? (
              <>
                <SimpleTable columns={columns} rows={ticketsQuery.data.data} getRowKey={(row) => String(row.id)} />
                <Pagination
                  page={ticketsQuery.data.page}
                  pageSize={ticketsQuery.data.pageSize}
                  total={ticketsQuery.data.total}
                  totalPages={ticketsQuery.data.totalPages}
                  onPageChange={setPage}
                  onPageSizeChange={handlePageSizeChange}
                />
              </>
            ) : (
              <EmptyState message="No hay tickets de Postventa en este periodo." />
            )
          ) : null}
        </div>
      </div>

      <div className={styles.heading} style={{ marginTop: 32 }}>
        <div>
          <h1 className={styles.title} style={{ fontSize: 22 }}>
            Reembolsos
          </h1>
          <p className={styles.subtitle}>Reembolsos de servicio (Cryo), por causa y por mes - usa los filtros de fecha y empresa de arriba.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.actionButton} onClick={handleExportReembolsos} disabled={isExportingReembolsos}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="M7 10l5 5 5-5" />
              <path d="M4 20h16" />
            </svg>
            {isExportingReembolsos ? 'Exportando...' : 'Exportar CSV'}
          </button>
        </div>
      </div>
      {reembolsoExportError ? <p className={styles.exportError}>{reembolsoExportError}</p> : null}

      <div className={tileStyles.chartStack}>
        <div className={chartStyles.chartCard}>
          <h2 className={styles.title} style={{ fontSize: 18 }}>
            Reembolsos por Mes
          </h2>
          <p className={styles.subtitle}>Monto reembolsado por mes, por estatus.</p>
          {reembolsosByMonthQuery.isLoading ? (
            <LoadingState label="Cargando reembolsos por mes..." />
          ) : (reembolsosByMonthQuery.data ?? []).length === 0 ? (
            <EmptyState message="No hay reembolsos en este periodo." />
          ) : (
            <ReembolsosByMonthChart rows={reembolsosByMonthQuery.data ?? []} formatValue={(v) => mxnFormatter.format(v)} />
          )}
        </div>

        <div className={chartStyles.chartCard}>
          <h2 className={styles.title} style={{ fontSize: 18 }}>
            Reembolsos por Causa
          </h2>
          <p className={styles.subtitle}>Monto reembolsado por causa, en el periodo seleccionado.</p>
          {reembolsosByCausaQuery.isLoading ? (
            <LoadingState label="Cargando reembolsos por causa..." />
          ) : (reembolsosByCausaQuery.data ?? []).length === 0 ? (
            <EmptyState message="No hay reembolsos en este periodo." />
          ) : (
            <ReembolsosByCausaChart rows={reembolsosByCausaQuery.data ?? []} formatValue={(v) => mxnFormatter.format(v)} />
          )}
        </div>

        <div className={chartStyles.chartCard}>
          <h2 className={styles.title} style={{ fontSize: 18 }}>
            Reembolsos Cerrados por Mes
          </h2>
          <p className={styles.subtitle}>
            {(reembolsosCerradosByMonthQuery.data ?? []).length > 0
              ? `${countFormatter.format(
                  (reembolsosCerradosByMonthQuery.data ?? []).reduce((sum, r) => sum + r.cantidad, 0),
                )} reembolsos cerrados, por un total de ${mxnFormatter.format(
                  (reembolsosCerradosByMonthQuery.data ?? []).reduce((sum, r) => sum + r.monto, 0),
                )}.`
              : 'Número de reembolsos cerrados por mes de su fecha de cierre.'}
          </p>
          {reembolsosCerradosByMonthQuery.isLoading ? (
            <LoadingState label="Cargando reembolsos cerrados por mes..." />
          ) : (reembolsosCerradosByMonthQuery.data ?? []).length === 0 ? (
            <EmptyState message="No hay reembolsos cerrados en este periodo." />
          ) : (
            <ReembolsosCerradosByMonthChart rows={reembolsosCerradosByMonthQuery.data ?? []} formatValue={(v) => countFormatter.format(v)} />
          )}
        </div>

        <div className={chartStyles.chartCard}>
          <h2 className={styles.title} style={{ fontSize: 18 }}>
            Detalle
          </h2>
          {reembolsosQuery.data ? (
            <p className={styles.subtitle}>{countFormatter.format(reembolsosQuery.data.total)} reembolsos en el periodo.</p>
          ) : null}
          {reembolsosQuery.isLoading ? <LoadingState label="Cargando reembolsos..." /> : null}
          {reembolsosQuery.isError ? (
            <ErrorState
              message={reembolsosQuery.error instanceof Error ? reembolsosQuery.error.message : 'No se pudieron cargar los reembolsos.'}
              onRetry={() => reembolsosQuery.refetch()}
            />
          ) : null}
          {!reembolsosQuery.isLoading && !reembolsosQuery.isError && reembolsosQuery.data ? (
            reembolsosQuery.data.data.length > 0 ? (
              <>
                <SimpleTable columns={reembolsoColumns} rows={reembolsosQuery.data.data} getRowKey={(row) => String(row.id_reembolso_producto)} />
                <Pagination
                  page={reembolsosQuery.data.page}
                  pageSize={reembolsosQuery.data.pageSize}
                  total={reembolsosQuery.data.total}
                  totalPages={reembolsosQuery.data.totalPages}
                  onPageChange={setReembolsoPage}
                  onPageSizeChange={handleReembolsoPageSizeChange}
                />
              </>
            ) : (
              <EmptyState message="No hay reembolsos en este periodo." />
            )
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
