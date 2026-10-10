import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { SimpleTable } from '../components/table/SimpleTable';
import type { SimpleColumn } from '../components/table/SimpleTable';
import { Pagination } from '../components/table/Pagination';
import { ComercialTareasChart } from '../components/charts/ComercialTareasChart';
import type { TareasBucket } from '../components/charts/ComercialTareasChart';
import { ComercialTareasByMonthChart } from '../components/charts/ComercialTareasByMonthChart';
import type { TareasByMonthStack } from '../components/charts/ComercialTareasByMonthChart';
import chartStyles from '../components/charts/charts.module.css';
import { useComercialReport } from '../hooks/useComercialReport';
import { useTareasVencidas } from '../hooks/useTareasVencidas';
import { useTareaVencidaVendedores } from '../hooks/useTareaVencidaVendedores';
import { useTareasVencidasByMonth } from '../hooks/useTareasVencidasByMonth';
import { fetchTareasVencidasExportCsv } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';
import { downloadBlob } from '../utils/downloadBlob';
import { formatDate } from '../utils/format';
import type { ProspectoCanal, TareaVencidaRow } from '../api/types';
import type { ActivoFilter } from '../utils/comercial';
import {
  bucketTareaVencidasByMonth,
  bucketTareaVencidasByMonthForVendedores,
  bucketTareasByMonth,
  bucketTareasByMonthForVendedor,
  bucketTareasCounts,
  bucketTareasCountsForVendedor,
  filterByActivo,
  filterByCanal,
  groupVendedorOptions,
  listVendedores,
  totalByMonthForVendedor,
} from '../utils/comercial';
import styles from './ComercialReportPage.module.css';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function defaultDateFrom(): string {
  const now = new Date();
  return toDateInputValue(new Date(now.getFullYear() - 1, now.getMonth(), 1));
}

function defaultDateTo(): string {
  return toDateInputValue(new Date());
}

const countFormatter = new Intl.NumberFormat('es-MX');
const METRIC_LABEL = 'Prospectos';
const CANALES = ['online', 'offline'] as const;
const CANAL_LABELS: Record<ProspectoCanal, string> = { online: 'Online', offline: 'Offline' };

/** Top-level page view - "Global" shows only all-vendedores-combined panels, "Por Vendedor" shows
 * only the vendedor selector + that one vendedor's panels, for BOTH the tareas-por-prospecto
 * section and the Tareas Vencidas section below it (per explicit instruction: one page-level
 * switch, not two independent ones). */
type ComercialView = 'global' | 'vendedor';

/** Splits a row set into its Online and Offline subsets and runs the same bucketing function over
 * each - same "always show both side by side" convention as MarketingReportPage's qualification
 * chart, instead of a third filter switch alongside Activos/Todos. */
function splitByCanal<T extends { canal: ProspectoCanal }, R>(rows: T[], bucketFn: (rows: T[]) => R): Record<ProspectoCanal, R> {
  return {
    online: bucketFn(filterByCanal(rows, 'online')),
    offline: bucketFn(filterByCanal(rows, 'offline')),
  };
}

/**
 * "Comercial" - how many "Tarea" (follow-up task) rows each prospecto accumulated before being
 * captured, by FechaCaptura date range - both overall and per vendedor, so a sales manager can see
 * whether a given vendedor is closing/disqualifying leads after a reasonable number of follow-ups
 * or letting them drag on. Same Prospecto/Lead/Vendedor data as /reports/prospectos and
 * /reports/marketing - see api/src-ts/reporting/comercialRepository.ts.
 */
export function ComercialReportPage() {
  const [view, setView] = useState<ComercialView>('global');
  const [dateFrom, setDateFrom] = useState(defaultDateFrom());
  const [dateTo, setDateTo] = useState(defaultDateTo());
  const [selectedVendedorKey, setSelectedVendedorKey] = useState<string | null>(null);
  // Defaults to "Todos" - the historical behavior every chart on this page already had before this
  // switch existed. "Activos" filters every chart below to Cryo.dbo.Prospecto.Activo = true only.
  const [activoFilter, setActivoFilter] = useState<ActivoFilter>('all');

  const { data, isLoading, isError, error, refetch } = useComercialReport(dateFrom, dateTo);

  const filteredGlobal = useMemo(() => filterByActivo(data?.global ?? [], activoFilter), [data, activoFilter]);
  const filteredPorVendedor = useMemo(() => filterByActivo(data?.porVendedor ?? [], activoFilter), [data, activoFilter]);

  const globalBuckets = useMemo(() => splitByCanal(filteredGlobal, bucketTareasCounts), [filteredGlobal]);
  const globalByMonth = useMemo(() => splitByCanal(filteredGlobal, bucketTareasByMonth), [filteredGlobal]);
  // The vendedor-select dropdown's own list never changes with either switch - a vendedor who only
  // has active (or only inactive, or only online/offline) prospectos should stay selectable.
  const vendedores = useMemo(() => listVendedores(data?.porVendedor ?? []), [data]);
  const emptyByCanal = useMemo(() => ({ online: [] as TareasBucket[], offline: [] as TareasBucket[] }), []);
  const emptyStackByCanal = useMemo(() => ({ online: [] as TareasByMonthStack[], offline: [] as TareasByMonthStack[] }), []);

  const vendedorBuckets = useMemo(
    () =>
      selectedVendedorKey !== null
        ? splitByCanal(filteredPorVendedor, (rows) => bucketTareasCountsForVendedor(rows, selectedVendedorKey))
        : emptyByCanal,
    [filteredPorVendedor, selectedVendedorKey, emptyByCanal],
  );
  const vendedorByMonth = useMemo(
    () =>
      selectedVendedorKey !== null
        ? splitByCanal(filteredPorVendedor, (rows) => bucketTareasByMonthForVendedor(rows, selectedVendedorKey))
        : emptyStackByCanal,
    [filteredPorVendedor, selectedVendedorKey, emptyStackByCanal],
  );
  const vendedorTotalByMonth = useMemo(
    () =>
      selectedVendedorKey !== null
        ? splitByCanal(filteredPorVendedor, (rows) => totalByMonthForVendedor(rows, selectedVendedorKey))
        : emptyByCanal,
    [filteredPorVendedor, selectedVendedorKey, emptyByCanal],
  );

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: 'Comercial' }]}>
      <div className={styles.heading}>
        <div>
          <h1 className={styles.title}>Reporte Comercial</h1>
          <p className={styles.subtitle}>Prospectos agrupados por número de tareas, por fecha de captura.</p>
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.metricToggle} role="group" aria-label="Vista">
          <button type="button" className={`${styles.metricButton} ${view === 'global' ? styles.metricButtonActive : ''}`} onClick={() => setView('global')}>
            Global
          </button>
          <button
            type="button"
            className={`${styles.metricButton} ${view === 'vendedor' ? styles.metricButtonActive : ''}`}
            onClick={() => setView('vendedor')}
          >
            Por Vendedor
          </button>
        </div>
      </div>

      <div className={styles.dateFilters}>
        <label className={styles.dateLabel}>
          Desde
          <input type="date" className={styles.dateInput} value={dateFrom} max={dateTo} onChange={(event) => setDateFrom(event.target.value)} />
        </label>
        <label className={styles.dateLabel}>
          Hasta
          <input type="date" className={styles.dateInput} value={dateTo} min={dateFrom} onChange={(event) => setDateTo(event.target.value)} />
        </label>
      </div>

      <div className={styles.controls}>
        <div className={styles.metricToggle} role="group" aria-label="Filtro">
          <button
            type="button"
            className={`${styles.metricButton} ${activoFilter === 'active' ? styles.metricButtonActive : ''}`}
            onClick={() => setActivoFilter('active')}
          >
            Activos
          </button>
          <button
            type="button"
            className={`${styles.metricButton} ${activoFilter === 'all' ? styles.metricButtonActive : ''}`}
            onClick={() => setActivoFilter('all')}
          >
            Todos
          </button>
        </div>
      </div>

      {isLoading && !data ? <LoadingState label="Cargando reporte comercial..." /> : null}
      {isError ? (
        <ErrorState message={error instanceof Error ? error.message : 'No se pudo cargar el reporte comercial.'} onRetry={() => refetch()} />
      ) : null}

      {!isError && data ? (
        <div className={styles.panels}>
          {view === 'global' ? (
            <>
              <div className={chartStyles.chartCard}>
                <h2 className={styles.panelTitle}>Tareas por prospecto · Global</h2>
                <p className={styles.panelSubtitle}>
                  Todos los prospectos del periodo (por fecha de captura), agrupados por su número de tareas - separado por canal Online / Offline.
                </p>
                <div className={styles.splitGrid}>
                  {CANALES.map((canal) => (
                    <div key={canal}>
                      <h3 className={styles.splitTitle}>{CANAL_LABELS[canal]}</h3>
                      {globalBuckets[canal].length === 0 ? (
                        <EmptyState message={`Sin prospectos ${CANAL_LABELS[canal].toLowerCase()} en este periodo.`} />
                      ) : (
                        <ComercialTareasChart rows={globalBuckets[canal]} metricLabel={METRIC_LABEL} formatValue={(v) => countFormatter.format(v)} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className={chartStyles.chartCard}>
                <h2 className={styles.panelTitle}>Tareas por prospecto · Global, por mes</h2>
                <p className={styles.panelSubtitle}>Misma agrupación, por mes de captura - separado por canal Online / Offline.</p>
                <div className={styles.splitGrid}>
                  {CANALES.map((canal) => (
                    <div key={canal}>
                      <h3 className={styles.splitTitle}>{CANAL_LABELS[canal]}</h3>
                      {globalByMonth[canal].length === 0 ? (
                        <EmptyState message={`Sin prospectos ${CANAL_LABELS[canal].toLowerCase()} en este periodo.`} />
                      ) : (
                        <ComercialTareasByMonthChart rows={globalByMonth[canal]} formatValue={(v) => countFormatter.format(v)} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>Por vendedor</h2>
                  <p className={styles.panelSubtitle}>Selecciona un vendedor para ver sus tareas y prospectos activos.</p>
                </div>
                <select
                  className={styles.vendedorSelect}
                  value={selectedVendedorKey ?? ''}
                  onChange={(event) => setSelectedVendedorKey(event.target.value || null)}
                  aria-label="Filtrar por vendedor"
                >
                  <option value="">Seleccione un vendedor...</option>
                  {vendedores.map((v) => (
                    <option key={v.key} value={v.key}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={chartStyles.chartCard}>
                <h2 className={styles.panelTitle}>Tareas por prospecto · Por vendedor</h2>
                <p className={styles.panelSubtitle}>Distribución de tareas del vendedor seleccionado - separado por canal Online / Offline.</p>
                {selectedVendedorKey === null ? (
                  <EmptyState message="Selecciona un vendedor para ver su distribución de tareas." />
                ) : (
                  <div className={styles.splitGrid}>
                    {CANALES.map((canal) => (
                      <div key={canal}>
                        <h3 className={styles.splitTitle}>{CANAL_LABELS[canal]}</h3>
                        {vendedorBuckets[canal].length === 0 ? (
                          <EmptyState message={`Sin prospectos ${CANAL_LABELS[canal].toLowerCase()} en este periodo.`} />
                        ) : (
                          <ComercialTareasChart rows={vendedorBuckets[canal]} metricLabel={METRIC_LABEL} formatValue={(v) => countFormatter.format(v)} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={chartStyles.chartCard}>
                <h2 className={styles.panelTitle}>Tareas por prospecto · Por vendedor, por mes</h2>
                <p className={styles.panelSubtitle}>Misma distribución, por mes de captura - separado por canal Online / Offline.</p>
                {selectedVendedorKey === null ? (
                  <EmptyState message="Selecciona un vendedor para ver su distribución de tareas por mes." />
                ) : (
                  <div className={styles.splitGrid}>
                    {CANALES.map((canal) => (
                      <div key={canal}>
                        <h3 className={styles.splitTitle}>{CANAL_LABELS[canal]}</h3>
                        {vendedorByMonth[canal].length === 0 ? (
                          <EmptyState message={`Sin prospectos ${CANAL_LABELS[canal].toLowerCase()} en este periodo.`} />
                        ) : (
                          <ComercialTareasByMonthChart rows={vendedorByMonth[canal]} formatValue={(v) => countFormatter.format(v)} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={chartStyles.chartCard}>
                <h2 className={styles.panelTitle}>{activoFilter === 'active' ? 'Prospectos activos' : 'Prospectos'} · Por vendedor, por mes</h2>
                <p className={styles.panelSubtitle}>
                  {activoFilter === 'active'
                    ? 'Prospectos del vendedor seleccionado, actualmente activos, por mes de captura - separado por canal Online / Offline.'
                    : 'Todos los prospectos del vendedor seleccionado, por mes de captura - separado por canal Online / Offline.'}
                </p>
                {selectedVendedorKey === null ? (
                  <EmptyState message="Selecciona un vendedor para ver sus prospectos." />
                ) : (
                  <div className={styles.splitGrid}>
                    {CANALES.map((canal) => (
                      <div key={canal}>
                        <h3 className={styles.splitTitle}>{CANAL_LABELS[canal]}</h3>
                        {vendedorTotalByMonth[canal].length === 0 ? (
                          <EmptyState message={`Sin prospectos ${CANAL_LABELS[canal].toLowerCase()} en este periodo.`} />
                        ) : (
                          <ComercialTareasChart
                            rows={vendedorTotalByMonth[canal]}
                            metricLabel={activoFilter === 'active' ? 'Prospectos activos' : 'Prospectos'}
                            formatValue={(v) => countFormatter.format(v)}
                            formatLabel={(key) => key}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}

      <div className={styles.panels}>
        <TareasVencidasSection
          view={view}
          selectedVendedorKey={selectedVendedorKey}
          activoFilter={activoFilter}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      </div>
    </AppShell>
  );
}

const TAREAS_VENCIDAS_PAGE_SIZE = 50;

/**
 * "Tareas Vencidas" - Cryo.dbo.Tarea rows that are overdue and were never properly closed on time:
 * FechaInicial (the task's own deadline - per explicit instruction, not FechaFinal) already passed,
 * AND FechaCierre is either null (never closed) or earlier than FechaInicial. A Comercial
 * sub-report, embedded directly in this page rather than a separate one (per explicit instruction)
 * - filtered by the task's own FechaInicial date range (not FechaCaptura, hence its own independent
 * date state/filters from the rest of this page). Gated by its own 'tareas_vencidas' permission,
 * additional to 'prospectos' - see api/src-ts/reporting/tareasVencidasController.ts.
 *
 * `view` is the SAME page-level Global/Por Vendedor switch the rest of ComercialReportPage uses -
 * "Global" shows only the all-vendedores-combined chart, "Por Vendedor" shows that one vendedor's
 * chart AND the detail table/export (the table only ever makes sense filtered to one vendedor, per
 * explicit instruction). `selectedVendedorKey`, `activoFilter`, `dateFrom`/`dateTo` are the SAME
 * page-level state the rest of ComercialReportPage uses too (per explicit instruction: one
 * vendedor selector, one Activos/Todos switch, and one Desde/Hasta filter driving the whole page,
 * not a second independent set just for this section, even though this section's own date range
 * technically means something different - FechaInicial of the task, not FechaCaptura of the
 * prospecto) - this section no longer owns any of them, it only resolves the shared vendedor key
 * into the raw Vendedor ids its own queries need (see selectedVendedorIds below).
 */
function TareasVencidasSection({
  view,
  selectedVendedorKey,
  activoFilter,
  dateFrom,
  dateTo,
}: {
  view: ComercialView;
  selectedVendedorKey: string | null;
  activoFilter: ActivoFilter;
  dateFrom: string;
  dateTo: string;
}) {
  const { getAccessToken } = useApiToken();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(TAREAS_VENCIDAS_PAGE_SIZE);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const activoOnly = activoFilter === 'active';

  const vendedoresQuery = useTareaVencidaVendedores(dateFrom, dateTo, view === 'vendedor');
  const vendedorGroups = useMemo(() => groupVendedorOptions(vendedoresQuery.data ?? []), [vendedoresQuery.data]);
  const selectedVendedorIds = useMemo(
    () => vendedorGroups.find((g) => g.key === selectedVendedorKey)?.ids ?? [],
    [vendedorGroups, selectedVendedorKey],
  );

  // selectedVendedorKey/activoFilter/dateFrom/dateTo are all owned by the parent page now (one
  // shared selector/switch/date-range for the whole page, per explicit instruction) - reset back
  // to page 1 whenever any of them changes out from under this section, same as this section's own
  // pageSize changes already did.
  useEffect(() => {
    setPage(1);
  }, [selectedVendedorKey, activoFilter, dateFrom, dateTo]);

  const { data, isLoading, isError, error, refetch } = useTareasVencidas(
    dateFrom,
    dateTo,
    selectedVendedorIds,
    page,
    pageSize,
    activoOnly,
    view === 'vendedor',
  );

  // Always fetches both breakdowns unfiltered by vendedor (see fetchTareasVencidasByMonth) - the
  // vendedor chart below just slices `porVendedor` by the same selectedVendedorIds the table/export
  // already use, so changing the vendedor selector never needs a refetch, same pattern as the rest
  // of this page. activoOnly DOES need a refetch though - it's applied server-side (Tarea.Activo),
  // not sliced client-side, since the backend returns pre-aggregated counts, not granular rows.
  const byMonthQuery = useTareasVencidasByMonth(dateFrom, dateTo, activoOnly);
  const globalByMonth = useMemo(() => bucketTareaVencidasByMonth(byMonthQuery.data?.global ?? []), [byMonthQuery.data]);
  const vendedorByMonth = useMemo(
    () => bucketTareaVencidasByMonthForVendedores(byMonthQuery.data?.porVendedor ?? [], selectedVendedorIds),
    [byMonthQuery.data, selectedVendedorIds],
  );

  function handlePageSizeChange(nextPageSize: number) {
    setPageSize(nextPageSize);
    setPage(1);
  }

  async function handleExport() {
    setIsExporting(true);
    setExportError(null);
    try {
      const token = await getAccessToken();
      const blob = await fetchTareasVencidasExportCsv(token, { dateFrom, dateTo, vendedorIds: selectedVendedorIds, activoOnly });
      downloadBlob(blob, `tareas-vencidas-${dateFrom}-a-${dateTo}.csv`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'No se pudo exportar el CSV.');
    } finally {
      setIsExporting(false);
    }
  }

  const columns: SimpleColumn<TareaVencidaRow>[] = [
    { key: 'fecha_inicial', header: 'Fecha Inicial (vencida)', render: (r) => formatDate(r.fecha_inicial) },
    { key: 'tipo_tarea', header: 'Tipo', render: (r) => r.tipo_tarea || '—' },
    { key: 'fecha_cierre', header: 'Fecha Cierre', render: (r) => (r.fecha_cierre ? formatDate(r.fecha_cierre) : 'Nunca cerrada') },
    { key: 'vendedor', header: 'Vendedor', render: (r) => r.vendedor || '—' },
    { key: 'madre', header: 'Madre', render: (r) => r.madre_completo?.trim() || '—' },
    { key: 'padre', header: 'Padre', render: (r) => r.padre_completo?.trim() || '—' },
    { key: 'telefonos', header: 'Teléfonos', render: (r) => r.telefonos || '—' },
    { key: 'activo', header: 'Activo', render: (r) => (r.activo ? 'Sí' : 'No') },
    { key: 'nota', header: 'Nota', render: (r) => <span className={styles.note}>{r.nota || '—'}</span> },
  ];

  return (
    <>
      <div className={chartStyles.chartCard}>
        <h2 className={styles.panelTitle}>Tareas Vencidas</h2>
        <p className={styles.panelSubtitle}>
          Tareas cuya fecha inicial ya pasó y que nunca se cerraron a tiempo (sin cierre, o cerradas después de vencer).
        </p>
      </div>

      {view === 'global' ? (
        <div className={chartStyles.chartCard}>
          <h2 className={styles.panelTitle}>Tareas Vencidas · Global, por mes</h2>
          <p className={styles.panelSubtitle}>Tareas vencidas del periodo (por fecha final), agrupadas por mes - todos los vendedores.</p>
          {byMonthQuery.isLoading ? (
            <LoadingState label="Cargando tareas vencidas..." />
          ) : globalByMonth.length === 0 ? (
            <EmptyState message="No hay tareas vencidas en este periodo." />
          ) : (
            <ComercialTareasChart rows={globalByMonth} metricLabel="Tareas vencidas" formatValue={(v) => countFormatter.format(v)} formatLabel={(key) => key} />
          )}
        </div>
      ) : (
        <>
          <div className={chartStyles.chartCard}>
            <div className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Tareas Vencidas · Por vendedor, por mes</h2>
                <p className={styles.panelSubtitle}>Selecciona un vendedor arriba para ver su distribución de tareas vencidas.</p>
              </div>
            </div>
            {selectedVendedorKey === null ? (
              <EmptyState message="Selecciona un vendedor para ver su distribución de tareas vencidas." />
            ) : byMonthQuery.isLoading ? (
              <LoadingState label="Cargando tareas vencidas..." />
            ) : vendedorByMonth.length === 0 ? (
              <EmptyState message="Este vendedor no tiene tareas vencidas en este periodo." />
            ) : (
              <ComercialTareasChart
                rows={vendedorByMonth}
                metricLabel="Tareas vencidas"
                formatValue={(v) => countFormatter.format(v)}
                formatLabel={(key) => key}
              />
            )}
          </div>

          <div className={chartStyles.chartCard}>
            <div className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Detalle de Tareas Vencidas</h2>
                <p className={styles.panelSubtitle}>Lista de tareas del vendedor seleccionado arriba.</p>
              </div>
              <button type="button" className={styles.actionButton} onClick={handleExport} disabled={isExporting || selectedVendedorKey === null}>
                {isExporting ? 'Exportando...' : 'Exportar CSV'}
              </button>
            </div>
            {exportError ? <p className={styles.exportError}>{exportError}</p> : null}

            {selectedVendedorKey === null ? (
              <EmptyState message="Selecciona un vendedor (arriba) para ver el detalle de sus tareas vencidas." />
            ) : (
              <>
                {data ? (
                  <p className={styles.panelSubtitle}>{new Intl.NumberFormat('es-MX').format(data.total)} tareas vencidas en el periodo.</p>
                ) : null}

                {isLoading ? <LoadingState label="Cargando tareas vencidas..." /> : null}
                {isError ? (
                  <ErrorState
                    message={error instanceof Error ? error.message : 'No se pudieron cargar las tareas vencidas.'}
                    onRetry={() => refetch()}
                  />
                ) : null}
                {!isLoading && !isError && data ? (
                  data.data.length > 0 ? (
                    <>
                      <SimpleTable columns={columns} rows={data.data} getRowKey={(row) => String(row.id_tarea)} />
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
                    <EmptyState message="Este vendedor no tiene tareas vencidas en este periodo." />
                  )
                ) : null}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
