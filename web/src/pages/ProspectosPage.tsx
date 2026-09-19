import { useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { SimpleTable } from '../components/table/SimpleTable';
import type { SimpleColumn } from '../components/table/SimpleTable';
import { Pagination } from '../components/table/Pagination';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { useProspectos } from '../hooks/useProspectos';
import { fetchProspectosExportCsv } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';
import { downloadBlob } from '../utils/downloadBlob';
import { formatDate } from '../utils/format';
import type { ProspectoRow } from '../api/types';
import styles from './ProspectosPage.module.css';

const DEFAULT_PAGE_SIZE = 50;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function defaultDateFrom(): string {
  const now = new Date();
  return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
}

function defaultDateTo(): string {
  return toDateInputValue(new Date());
}

/**
 * "Prospectos" - CRM lead-funnel report from the legacy Cryo.dbo database, reproducing the sales
 * team's own hand-written SSMS query (Prospecto joined to Lead/Etapa/Ciudad/Canal/Vendedor/
 * Contrato, plus a phone rollup and most-recent-Tarea lookup) filtered by FechaCaptura date range.
 */
export function ProspectosPage() {
  const { getAccessToken } = useApiToken();
  const [dateFrom, setDateFrom] = useState(defaultDateFrom());
  const [dateTo, setDateTo] = useState(defaultDateTo());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useProspectos(dateFrom, dateTo, page, pageSize);

  function handleDateFromChange(value: string) {
    setDateFrom(value);
    setPage(1);
  }

  function handleDateToChange(value: string) {
    setDateTo(value);
    setPage(1);
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
      const blob = await fetchProspectosExportCsv(token, dateFrom, dateTo);
      downloadBlob(blob, `prospectos-${dateFrom}-a-${dateTo}.csv`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'No se pudo exportar el CSV.');
    } finally {
      setIsExporting(false);
    }
  }

  const columns: SimpleColumn<ProspectoRow>[] = [
    { key: 'fecha_captura', header: 'Fecha Captura', render: (r) => formatDate(r.fecha_captura) },
    { key: 'madre', header: 'Madre', render: (r) => r.madre_completo?.trim() || '—' },
    { key: 'padre', header: 'Padre', render: (r) => r.padre_completo?.trim() || '—' },
    { key: 'telefonos', header: 'Teléfonos', render: (r) => r.telefonos || '—' },
    { key: 'ciudad', header: 'Ciudad', render: (r) => r.ciudad || '—' },
    { key: 'tipo_canal', header: 'Tipo Canal', render: (r) => r.tipo_canal || '—' },
    { key: 'canal', header: 'Canal', render: (r) => r.canal || '—' },
    { key: 'vendedor', header: 'Vendedor', render: (r) => r.vendedor || '—' },
    { key: 'etapa', header: 'Etapa', render: (r) => r.etapa || '—' },
    { key: 'estatus', header: 'Estatus', render: (r) => r.estatus || '—' },
    { key: 'activo', header: 'Activo', render: (r) => (r.activo ? 'Sí' : 'No') },
    { key: 'motivo', header: 'Motivo (No Venta)', render: (r) => r.motivo || '—' },
    { key: 'fecha_probable', header: 'Fecha Probable', render: (r) => formatDate(r.fecha_probable) },
    { key: 'tareas', header: 'Tareas', render: (r) => String(r.tareas) },
    { key: 'fecha_cierre_tarea', header: 'Cierre Última Tarea', render: (r) => formatDate(r.fecha_cierre_tarea) },
    { key: 'nota_tarea', header: 'Nota Última Tarea', render: (r) => <span className={styles.note}>{r.nota_tarea || '—'}</span> },
    {
      key: 'contrato',
      header: 'Contrato',
      render: (r) => <span className={r.contrato === ':D' ? styles.converted : styles.notConverted}>{r.contrato}</span>,
    },
    { key: 'folio_contrato', header: 'Folio Contrato', render: (r) => r.folio_contrato || '—' },
    { key: 'fecha_venta', header: 'Fecha Venta', render: (r) => formatDate(r.fecha_venta) },
    { key: 'mes_cancelacion', header: 'Mes Cancelación', render: (r) => (r.mes_cancelacion ? String(r.mes_cancelacion) : '—') },
  ];

  const numberFormatter = new Intl.NumberFormat('es-MX');
  const convertedCount = data?.data.filter((r) => r.contrato === ':D').length ?? 0;

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: 'Prospectos' }]}>
      <div className={styles.heading}>
        <div>
          <h1 className={styles.title}>Prospectos</h1>
          <p className={styles.subtitle}>Embudo de prospectos capturados, filtrado por fecha de captura.</p>
        </div>
        <button type="button" className={styles.actionButton} onClick={handleExport} disabled={isExporting}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 3v12" />
            <path d="M7 10l5 5 5-5" />
            <path d="M4 20h16" />
          </svg>
          {isExporting ? 'Exportando...' : 'Exportar CSV'}
        </button>
      </div>
      {exportError ? <p className={styles.exportError}>{exportError}</p> : null}
      <div className={styles.dateFilters}>
        <label className={styles.dateLabel}>
          Desde
          <input
            type="date"
            className={styles.dateInput}
            value={dateFrom}
            max={dateTo}
            onChange={(event) => handleDateFromChange(event.target.value)}
          />
        </label>
        <label className={styles.dateLabel}>
          Hasta
          <input
            type="date"
            className={styles.dateInput}
            value={dateTo}
            min={dateFrom}
            onChange={(event) => handleDateToChange(event.target.value)}
          />
        </label>
      </div>
      {data ? (
        <div className={styles.summaryBar}>
          <div className={styles.summaryStat}>
            <span className={styles.summaryValue}>{numberFormatter.format(data.total)}</span>
            <span className={styles.summaryLabel}>prospectos en el periodo</span>
          </div>
          <div className={styles.summaryStat}>
            <span className={styles.summaryValue}>{numberFormatter.format(convertedCount)}</span>
            <span className={styles.summaryLabel}>convertidos a contrato (esta página)</span>
          </div>
        </div>
      ) : null}
      {isLoading ? <LoadingState label="Cargando prospectos..." /> : null}
      {isError ? (
        <ErrorState message={error instanceof Error ? error.message : 'No se pudieron cargar los prospectos.'} onRetry={() => refetch()} />
      ) : null}
      {!isLoading && !isError && data ? (
        data.data.length > 0 ? (
          <>
            <SimpleTable columns={columns} rows={data.data} getRowKey={(row) => String(row.id_prospecto)} />
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              totalPages={data.totalPages}
              onPageChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
          </>
        ) : (
          <EmptyState message="No hay prospectos capturados en este periodo." />
        )
      ) : null}
    </AppShell>
  );
}
