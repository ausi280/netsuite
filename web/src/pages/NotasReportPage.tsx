import { useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { SimpleTable } from '../components/table/SimpleTable';
import type { SimpleColumn } from '../components/table/SimpleTable';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { useNotesReport } from '../hooks/useNotesReport';
import { fetchNotesReportExportCsv } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';
import { downloadBlob } from '../utils/downloadBlob';
import { formatDateTime } from '../utils/format';
import type { NotesReportRow } from '../api/types';
import styles from './NotasReportPage.module.css';

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
 * "Reporte de Notas" - every NetSuite-native Note attached to a Contrato, date-filtered across
 * every contract at once (unlike the per-contract Notes tab on the contract dossier). Not backed
 * by our synced SQL tables - always calls NetSuite directly through a RESTlet (see
 * api/src-ts/reporting/notesReportRepository.ts for why), so there's no pagination/subsidiary
 * filter here the way other reports have - just the date range NetSuite itself is queried with.
 */
export function NotasReportPage() {
  const { getAccessToken } = useApiToken();
  const [dateFrom, setDateFrom] = useState(defaultDateFrom());
  const [dateTo, setDateTo] = useState(defaultDateTo());
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useNotesReport(dateFrom, dateTo);

  async function handleExport() {
    setIsExporting(true);
    setExportError(null);
    try {
      const token = await getAccessToken();
      const blob = await fetchNotesReportExportCsv(token, dateFrom, dateTo);
      downloadBlob(blob, `notas-${dateFrom}-a-${dateTo}.csv`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'No se pudo exportar el CSV.');
    } finally {
      setIsExporting(false);
    }
  }

  const columns: SimpleColumn<NotesReportRow>[] = [
    { key: 'contrato', header: 'Contrato', render: (r) => r.contrato || '—' },
    { key: 'folio_sistema_anterior', header: 'Folio sistema anterior', render: (r) => r.folio_sistema_anterior || '—' },
    {
      key: 'sistema',
      header: 'Sistema',
      render: (r) => (
        <span className={r.sistema === 'Sistema Anterior' ? styles.sistemaAnterior : styles.sistemaNuevo}>{r.sistema}</span>
      ),
    },
    { key: 'fecha_creacion', header: 'Fecha de creación', render: (r) => formatDateTime(r.fecha_creacion) },
    { key: 'usuario', header: 'Usuario', render: (r) => r.usuario || '—' },
    { key: 'titulo', header: 'Título', render: (r) => r.titulo || '—' },
    { key: 'nota', header: 'Nota', render: (r) => <span className={styles.note}>{r.nota || '—'}</span> },
  ];

  const numberFormatter = new Intl.NumberFormat('es-MX');
  const sistemaAnteriorCount = data?.data.filter((r) => r.sistema === 'Sistema Anterior').length ?? 0;
  const netsuiteCount = data?.data.filter((r) => r.sistema === 'NetSuite').length ?? 0;

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: 'Contracts', to: '/reports/contracts' }, { label: 'Notas' }]}>
      <div className={styles.heading}>
        <div>
          <h1 className={styles.title}>Reporte de Notas</h1>
          <p className={styles.subtitle}>Notas del sistema anterior y de NetSuite, de todos los contratos, filtradas por fecha de creación.</p>
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
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </label>
        <label className={styles.dateLabel}>
          Hasta
          <input
            type="date"
            className={styles.dateInput}
            value={dateTo}
            min={dateFrom}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </label>
      </div>
      {data && data.truncated ? (
        <div className={styles.truncatedBanner}>
          Hay más notas de las que se pudieron cargar en esta consulta. Reduce el rango de fechas para ver el resto.
        </div>
      ) : null}
      {data ? (
        <div className={styles.summaryBar}>
          <div className={styles.summaryStat}>
            <span className={styles.summaryValue}>{numberFormatter.format(data.data.length)}</span>
            <span className={styles.summaryLabel}>notas en el periodo</span>
          </div>
          <div className={styles.summaryStat}>
            <span className={styles.summaryValue}>{numberFormatter.format(sistemaAnteriorCount)}</span>
            <span className={styles.summaryLabel}>sistema anterior</span>
          </div>
          <div className={styles.summaryStat}>
            <span className={styles.summaryValue}>{numberFormatter.format(netsuiteCount)}</span>
            <span className={styles.summaryLabel}>NetSuite</span>
          </div>
        </div>
      ) : null}
      {isLoading ? <LoadingState label="Cargando notas..." /> : null}
      {isError ? <ErrorState message={error instanceof Error ? error.message : 'No se pudieron cargar las notas.'} onRetry={() => refetch()} /> : null}
      {!isLoading && !isError && data ? (
        data.data.length > 0 ? (
          <SimpleTable columns={columns} rows={data.data} getRowKey={(row, index) => `${row.contrato}-${index}`} emptyMessage="No hay notas en este periodo." />
        ) : (
          <EmptyState message="No hay notas en este periodo." />
        )
      ) : null}
    </AppShell>
  );
}
