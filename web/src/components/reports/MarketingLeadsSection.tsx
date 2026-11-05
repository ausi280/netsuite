import { useState } from 'react';
import { SimpleTable } from '../table/SimpleTable';
import type { SimpleColumn } from '../table/SimpleTable';
import { Pagination } from '../table/Pagination';
import { LoadingState } from '../common/LoadingState';
import { ErrorState } from '../common/ErrorState';
import { EmptyState } from '../common/EmptyState';
import chartStyles from '../charts/charts.module.css';
import { fetchMarketingLeadsExportCsv } from '../../api/reportsApi';
import { useApiToken } from '../../auth/useApiToken';
import { useMarketingLeads } from '../../hooks/useMarketingLeads';
import { downloadBlob } from '../../utils/downloadBlob';
import { formatDate } from '../../utils/format';
import type { MarketingLeadRow, MarketingPais, ProspectoQualificationCategory } from '../../api/types';
import prospectosStyles from '../../pages/ProspectosPage.module.css';
import styles from '../../pages/MarketingReportPage.module.css';

const DEFAULT_PAGE_SIZE = 50;

const CATEGORIES: ProspectoQualificationCategory[] = [
  'Prospecto',
  'Contactado: datos incompletos',
  'En intento',
  'No contactado',
  'No calificado',
  'Lead inválido',
];

/** Argentina only classifies by motivo de pérdida, so these are the only categories it can have. */
const ARGENTINA_CATEGORIES: ProspectoQualificationCategory[] = ['Prospecto', 'No contactado', 'No calificado'];

const COMMON_COLUMNS: SimpleColumn<MarketingLeadRow>[] = [
  { key: 'id', header: 'ID', render: (r) => r.id },
  { key: 'fecha_captura', header: 'Fecha', render: (r) => formatDate(r.fecha_captura) },
  { key: 'lead', header: 'Lead', render: (r) => r.lead || '—' },
  { key: 'empresa', header: 'Empresa / Marca', render: (r) => r.empresa },
  { key: 'canal', header: 'Online / Offline', render: (r) => (r.canal === 'online' ? 'Online' : 'Offline') },
  { key: 'canal_nombre', header: 'Canal', render: (r) => r.canal_nombre || '—' },
  { key: 'categoria', header: 'Clasificación', render: (r) => r.categoria },
  { key: 'razon', header: 'Razón', render: (r) => <span className={prospectosStyles.note}>{r.razon}</span> },
  { key: 'etapa', header: 'Etapa', render: (r) => r.etapa || '—' },
];

const MEXICO_COLUMNS: SimpleColumn<MarketingLeadRow>[] = [
  { key: 'intentos', header: 'Intentos', render: (r) => String(r.intentos ?? 0) },
  { key: 'fecha_probable', header: 'FPP', render: (r) => formatDate(r.fecha_probable) },
  { key: 'ciudad', header: 'Ciudad', render: (r) => r.ciudad || '—' },
  { key: 'vendedor', header: 'Vendedor', render: (r) => r.vendedor || '—' },
];

/**
 * Every lead of the period with its classification and why - the same classification the charts
 * above count (see classifyLead in api/src-ts/reporting/marketingRepository.ts), so filtering by a
 * category lists exactly the leads behind that category's number.
 *
 * The parent remounts this with a key when the period, country or brand change, which also takes it
 * back to page 1.
 */
export function MarketingLeadsSection({ pais, dateFrom, dateTo, marca }: { pais: MarketingPais; dateFrom: string; dateTo: string; marca: string }) {
  const { getAccessToken } = useApiToken();
  const [categoria, setCategoria] = useState('');
  const [canal, setCanal] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const filters = { pais, dateFrom, dateTo, marca, categoria, canal };
  const { data, isLoading, isError, error, refetch } = useMarketingLeads(filters, page, pageSize);
  const columns = pais === 'MX' ? [...COMMON_COLUMNS, ...MEXICO_COLUMNS] : COMMON_COLUMNS;

  async function handleExport() {
    setIsExporting(true);
    setExportError(null);
    try {
      const token = await getAccessToken();
      const blob = await fetchMarketingLeadsExportCsv(token, filters);
      downloadBlob(blob, `clasificacion-leads-${pais}-${dateFrom}-a-${dateTo}.csv`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'No se pudo exportar el CSV.');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className={chartStyles.chartCard}>
      <h2 className={styles.panelTitle}>Clasificación por lead</h2>
      <p className={styles.panelSubtitle}>Cada lead del periodo, su clasificación y la razón - la misma clasificación que cuentan las gráficas de arriba.</p>

      <div className={styles.dateFilters}>
        <label className={styles.dateLabel}>
          Clasificación
          <select
            className={styles.dateInput}
            value={categoria}
            onChange={(event) => {
              setCategoria(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {(pais === 'AR' ? ARGENTINA_CATEGORIES : CATEGORIES).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.dateLabel}>
          Online / Offline
          <select
            className={styles.dateInput}
            value={canal}
            onChange={(event) => {
              setCanal(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </label>
        <button type="button" className={prospectosStyles.actionButton} onClick={handleExport} disabled={isExporting}>
          {isExporting ? 'Exportando...' : 'Exportar CSV'}
        </button>
      </div>
      {exportError ? <p className={prospectosStyles.exportError}>{exportError}</p> : null}

      {isLoading ? <LoadingState label="Cargando leads..." /> : null}
      {isError ? <ErrorState message={error instanceof Error ? error.message : 'No se pudieron cargar los leads.'} onRetry={() => refetch()} /> : null}
      {!isLoading && !isError && data ? (
        data.data.length > 0 ? (
          <>
            <SimpleTable columns={columns} rows={data.data} getRowKey={(row) => row.id} />
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              totalPages={data.totalPages}
              onPageChange={setPage}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
            />
          </>
        ) : (
          <EmptyState message="No hay leads con estos filtros." />
        )
      ) : null}
    </div>
  );
}
