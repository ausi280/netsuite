import { useMemo, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { MarketingSalesChart } from '../components/charts/MarketingSalesChart';
import { MarketingQualificationChart } from '../components/charts/MarketingQualificationChart';
import { MotivosBreakdownTable } from '../components/charts/MotivosBreakdownTable';
import chartStyles from '../components/charts/charts.module.css';
import { useMarketingReport } from '../hooks/useMarketingReport';
import type { MarketingSalesByMonthRow, QualificationByMonthRow } from '../api/types';
import styles from './MarketingReportPage.module.css';

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

/** "Leads contactados" = Calificados + Lead no calificado (both mean the prospect WAS reached,
 * regardless of outcome) - deliberately excludes "No contactado", which by definition never was.
 * Derived client-side from the same qualification.byMonth rows the split chart above already
 * fetches, split online/offline the same way, re-shaped to MarketingSalesChart's own row shape so
 * that component can be reused as-is instead of writing a near-duplicate. */
function buildLeadsContactadosByMonth(byMonth: QualificationByMonthRow[]): MarketingSalesByMonthRow[] {
  const byKey = new Map<string, MarketingSalesByMonthRow>();

  for (const row of byMonth) {
    const key = `${row.anio}-${row.mes}`;
    const existing = byKey.get(key) ?? { anio: row.anio, mes: row.mes, online: 0, offline: 0, total: 0 };
    const contactados = row.calificados + row.lead_no_calificado;
    if (row.canal === 'online') existing.online += contactados;
    else existing.offline += contactados;
    existing.total += contactados;
    byKey.set(key, existing);
  }

  return Array.from(byKey.values()).sort((a, b) => a.anio - b.anio || a.mes - b.mes);
}

/**
 * "Reporte de Marketing" - two charts built on top of the same Prospecto data as /reports/
 * prospectos (legacy Cryo.dbo CRM lead funnel), scoped to the 3 Mexican brands (CRYO-CELL DE
 * MEXICO / BCU / BSCU) - see api/src-ts/reporting/marketingRepository.ts for exactly which ids
 * this covers and why.
 *
 *  - "Ventas por mes": every Prospecto with a matched Contrato, by the contract's own sale month,
 *    split online (Internet TipoCanal) vs offline (everything else).
 *  - "Calificación de prospectos": every prospecto in the date range (by capture date), grouped
 *    into Calificados / No contactado / Lead no calificado by its ID_NoVenta - with the full,
 *    always-visible per-motivo breakdown below so it's clear exactly which raw reason rolled into
 *    which bucket, for a future re-categorization.
 */
export function MarketingReportPage() {
  const [dateFrom, setDateFrom] = useState(defaultDateFrom());
  const [dateTo, setDateTo] = useState(defaultDateTo());

  const { data, isLoading, isError, error, refetch } = useMarketingReport(dateFrom, dateTo);

  const leadsContactadosByMonth = useMemo(() => buildLeadsContactadosByMonth(data?.qualification.byMonth ?? []), [data]);

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: 'Prospectos', to: '/reports/prospectos' }, { label: 'Marketing' }]}>
      <div className={styles.heading}>
        <div>
          <h1 className={styles.title}>Reporte de Marketing</h1>
          <p className={styles.subtitle}>Ventas por canal y calificación de prospectos - CRYO-CELL DE MEXICO, BCU y BSCU.</p>
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

      {isLoading && !data ? <LoadingState label="Cargando reporte de marketing..." /> : null}
      {isError ? (
        <ErrorState message={error instanceof Error ? error.message : 'No se pudo cargar el reporte de marketing.'} onRetry={() => refetch()} />
      ) : null}

      {!isError && data ? (
        <div className={styles.panels}>
          <div className={chartStyles.chartCard}>
            <h2 className={styles.panelTitle}>Ventas por mes (Online / Offline)</h2>
            <p className={styles.panelSubtitle}>
              Prospectos con contrato asociado, por mes de venta del contrato. "Online" = canal Internet de cada empresa.
            </p>
            {data.salesByMonth.length === 0 ? (
              <EmptyState message="No hay ventas en este periodo." />
            ) : (
              <MarketingSalesChart rows={data.salesByMonth} formatValue={(v) => countFormatter.format(v)} />
            )}
          </div>

          <div className={chartStyles.chartCard}>
            <h2 className={styles.panelTitle}>Calificación de prospectos por mes</h2>
            <p className={styles.panelSubtitle}>
              Todos los prospectos del periodo (por fecha de captura), por mes, agrupados por su motivo de no-venta - separado por canal Online / Offline.
            </p>
            {data.qualification.summary.total === 0 ? (
              <EmptyState message="No hay prospectos en este periodo." />
            ) : (
              <>
                <div className={styles.summaryBar}>
                  <div className={styles.summaryStat}>
                    <span className={styles.summaryValue}>{countFormatter.format(data.qualification.summary.total)}</span>
                    <span className={styles.summaryLabel}>prospectos en el periodo</span>
                  </div>
                  <div className={styles.summaryStat}>
                    <span className={styles.summaryValue}>{countFormatter.format(data.qualification.summary.calificados)}</span>
                    <span className={styles.summaryLabel}>calificados</span>
                  </div>
                  <div className={styles.summaryStat}>
                    <span className={styles.summaryValue}>{countFormatter.format(data.qualification.summary.no_contactado)}</span>
                    <span className={styles.summaryLabel}>no contactados</span>
                  </div>
                  <div className={styles.summaryStat}>
                    <span className={styles.summaryValue}>{countFormatter.format(data.qualification.summary.lead_no_calificado)}</span>
                    <span className={styles.summaryLabel}>lead no calificado</span>
                  </div>
                </div>
                <div className={styles.splitGrid}>
                  {(['online', 'offline'] as const).map((canal) => {
                    const canalRows = data.qualification.byMonth.filter((row) => row.canal === canal);
                    return (
                      <div key={canal}>
                        <h3 className={styles.splitTitle}>{canal === 'online' ? 'Online' : 'Offline'}</h3>
                        {canalRows.length === 0 ? (
                          <EmptyState message={`Sin prospectos ${canal} en este periodo.`} />
                        ) : (
                          <MarketingQualificationChart rows={canalRows} formatValue={(v) => countFormatter.format(v)} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className={chartStyles.chartCard}>
            <h2 className={styles.panelTitle}>Leads contactados por mes (Online / Offline)</h2>
            <p className={styles.panelSubtitle}>Calificados + Lead no calificado (excluye No contactado) - el prospecto fue alcanzado, sin importar el resultado.</p>
            {leadsContactadosByMonth.length === 0 ? (
              <EmptyState message="No hay prospectos en este periodo." />
            ) : (
              <MarketingSalesChart rows={leadsContactadosByMonth} formatValue={(v) => countFormatter.format(v)} />
            )}
          </div>

          {data.qualification.motivos.length > 0 ? (
            <div className={chartStyles.chartCard}>
              <h2 className={styles.panelTitle}>Detalle por motivo de no-venta</h2>
              <p className={styles.motivosNote}>
                Cada fila es un motivo real de Cryo.dbo.noventa (con su propia empresa e ID_NoVenta) y la categoría en la que se agrupó arriba - útil
                para verificar o ajustar la clasificación en el futuro.
              </p>
              <MotivosBreakdownTable rows={data.qualification.motivos} formatCount={(v) => countFormatter.format(v)} />
            </div>
          ) : null}
        </div>
      ) : null}
    </AppShell>
  );
}
