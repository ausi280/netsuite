import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { MarketingSalesChart } from '../components/charts/MarketingSalesChart';
import { MarketingQualificationChart } from '../components/charts/MarketingQualificationChart';
import { MarketingFunnelSection } from '../components/charts/MarketingFunnelSection';
import { MarketingLeadsSection } from '../components/reports/MarketingLeadsSection';
import { MarketingTicketsSection } from '../components/reports/MarketingTicketsSection';
import { buildMarketingFunnel } from '../utils/marketingFunnel';
import { ARGENTINA_MARCAS, MARKETING_PAISES, parseArgentinaMarca, parseMarketingPais } from '../utils/marketingPais';
import chartStyles from '../components/charts/charts.module.css';
import { useMarketingReport } from '../hooks/useMarketingReport';
import type { MarketingPais, MarketingSalesByMonthRow, QualificationByMonthRow } from '../api/types';
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

const pctFormatter = new Intl.NumberFormat('es-MX', { style: 'percent', maximumFractionDigits: 1 });

function formatRate(part: number, whole: number): string {
  return whole > 0 ? pctFormatter.format(part / whole) : '—';
}

/** "Leads contactados" = Prospecto + datos incompletos + No calificado (all mean the lead WAS
 * reached, regardless of outcome) - deliberately excludes En intento / No contactado, which by
 * definition weren't, and Lead inválido, which isn't a lead.
 * Derived client-side from the same qualification.byMonth rows the split chart above already
 * fetches, split online/offline the same way, re-shaped to MarketingSalesChart's own row shape so
 * that component can be reused as-is instead of writing a near-duplicate. */
function buildLeadsContactadosByMonth(byMonth: QualificationByMonthRow[]): MarketingSalesByMonthRow[] {
  const byKey = new Map<string, MarketingSalesByMonthRow>();

  for (const row of byMonth) {
    const key = `${row.anio}-${row.mes}`;
    const existing = byKey.get(key) ?? { anio: row.anio, mes: row.mes, online: 0, offline: 0, total: 0 };
    const contactados = row.prospecto + row.datos_incompletos + row.no_calificado;
    if (row.canal === 'online') existing.online += contactados;
    else existing.offline += contactados;
    existing.total += contactados;
    byKey.set(key, existing);
  }

  return Array.from(byKey.values()).sort((a, b) => a.anio - b.anio || a.mes - b.mes);
}

/**
 * "Reporte de Marketing", per country (?pais=MX|AR). México: built on top of the same Prospecto
 * data as /reports/prospectos (legacy Cryo.dbo CRM lead funnel), scoped to the 3 Mexican brands
 * (CRYO-CELL DE MEXICO / BCU / BSCU) - see api/src-ts/reporting/marketingRepository.ts. Argentina:
 * NetSuite leads and contracts (subsidiary 20, Biocells + Cryolab) - see
 * api/src-ts/reporting/argentinaMarketingRepository.ts. Same charts and shapes for both.
 *
 *  - "Ventas por mes": every Prospecto with a matched Contrato, by the contract's own sale month,
 *    split online (Internet TipoCanal) vs offline (everything else).
 *  - "Clasificación de leads": every lead in the date range (by capture date), classified by
 *    classifyLead in marketingRepository.ts (México) - with a grid below of every lead, its category
 *    and why. Argentina keeps its motivo-only classification.
 */
export function MarketingReportPage() {
  const [dateFrom, setDateFrom] = useState(defaultDateFrom());
  const [dateTo, setDateTo] = useState(defaultDateTo());
  const [searchParams, setSearchParams] = useSearchParams();
  const pais = parseMarketingPais(searchParams.get('pais'));
  const config = MARKETING_PAISES[pais];
  // Brand filter - Argentina only (México's CRM data is already split by empresa elsewhere).
  const marca = pais === 'AR' ? parseArgentinaMarca(searchParams.get('marca')) : '';
  const marcaLabel = ARGENTINA_MARCAS.find((m) => m.id === marca)?.label;

  function handleParamChange(key: 'pais' | 'marca', value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'pais' && value !== 'AR') next.delete('marca');
    setSearchParams(next, { replace: true });
  }

  const { data, isLoading, isError, error, refetch } = useMarketingReport(pais, dateFrom, dateTo, marca);

  const summary = data?.qualification.summary;
  const leadsValidos = summary ? summary.total - summary.lead_invalido : 0;
  const contactados = summary ? summary.prospecto + summary.datos_incompletos + summary.no_calificado : 0;
  const leadsContactadosByMonth = useMemo(() => buildLeadsContactadosByMonth(data?.qualification.byMonth ?? []), [data]);
  const funnel = useMemo(
    // Inversión and metas are captured per country, not per brand - a single brand gets none
    // rather than being compared against the whole country's.
    () => (data ? buildMarketingFunnel(data.qualification.byMonth, data.salesByMonth, marca ? [] : (data.funnelInputs ?? []), dateFrom, dateTo) : null),
    [data, dateFrom, dateTo, marca],
  );

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: 'Prospectos', to: '/reports/prospectos' }, { label: 'Marketing' }]}>
      <div className={styles.heading}>
        <div>
          <h1 className={styles.title}>Reporte de Marketing</h1>
          <p className={styles.subtitle}>
            Ventas por canal y clasificación de leads · {config.label} - {marcaLabel && marca ? marcaLabel : config.marcas} (prospectos de {config.fuente}).
          </p>
        </div>
      </div>

      <div className={styles.dateFilters}>
        <label className={styles.dateLabel}>
          País
          <select className={styles.dateInput} value={pais} onChange={(event) => handleParamChange('pais', event.target.value)}>
            {(Object.keys(MARKETING_PAISES) as MarketingPais[]).map((key) => (
              <option key={key} value={key}>
                {MARKETING_PAISES[key].label}
              </option>
            ))}
          </select>
        </label>
        {pais === 'AR' ? (
          <label className={styles.dateLabel}>
            Marca
            <select className={styles.dateInput} value={marca} onChange={(event) => handleParamChange('marca', event.target.value)}>
              {ARGENTINA_MARCAS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
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
          {funnel ? (
            <MarketingFunnelSection
              funnel={funnel}
              pais={pais}
              scopeNote={
                marca
                  ? `Solo ${marcaLabel}: la inversión y las metas se capturan por país, no por marca - CAC, CPL y cumplimientos se muestran con "Todas".`
                  : undefined
              }
              canEditInputs={data.canEditInputs}
              captureLink={`/reports/marketing/captura?year=${dateTo.slice(0, 4)}&pais=${pais}`}
            />
          ) : null}

          <div className={chartStyles.chartCard}>
            <h2 className={styles.panelTitle}>Ventas por mes (Online / Offline)</h2>
            <p className={styles.panelSubtitle}>
              {pais === 'AR' ? 'Contratos de Argentina por mes de inicio del contrato.' : 'Prospectos con contrato asociado, por mes de venta del contrato.'} {config.onlineNote}
            </p>
            {data.salesByMonth.length === 0 ? (
              <EmptyState message="No hay ventas en este periodo." />
            ) : (
              <MarketingSalesChart rows={data.salesByMonth} formatValue={(v) => countFormatter.format(v)} />
            )}
          </div>

          <div className={chartStyles.chartCard}>
            <h2 className={styles.panelTitle}>Clasificación de leads por mes</h2>
            <p className={styles.panelSubtitle}>
              {pais === 'AR'
                ? 'Todos los leads del periodo (por fecha de alta como lead), por mes, agrupados por su motivo de pérdida - separado por canal Online / Offline.'
                : 'Todos los registros del periodo (por fecha de captura), por mes - separado por canal Online / Offline. Prospecto = hubo conversación y pasa los filtros de embarazo, parto en México y bebé no nacido. Sin score ni prioridad: el CRM no captura intención, parentesco ni tipo de hospital. La conversación se infiere de la venta, la etapa o el motivo de cierre, y una FPP asignada automáticamente al capturar (+14 días) cuenta como dato faltante.'}
            </p>
            {summary?.total === 0 ? (
              <EmptyState message="No hay leads en este periodo." />
            ) : summary ? (
              <>
                <div className={styles.summaryBar}>
                  {[
                    { label: 'registros en el periodo', value: summary.total },
                    { label: 'leads inválidos', value: summary.lead_invalido },
                    { label: 'leads válidos', value: leadsValidos },
                    { label: 'prospectos', value: summary.prospecto },
                    { label: 'contactados: datos incompletos', value: summary.datos_incompletos },
                    { label: 'en intento', value: summary.en_intento },
                    { label: 'no contactados', value: summary.no_contactado },
                    { label: 'no calificados', value: summary.no_calificado },
                  ]
                    .filter((stat) => pais === 'MX' || stat.value > 0)
                    .map((stat) => (
                      <div className={styles.summaryStat} key={stat.label}>
                        <span className={styles.summaryValue}>{countFormatter.format(stat.value)}</span>
                        <span className={styles.summaryLabel}>{stat.label}</span>
                      </div>
                    ))}
                </div>
                {data.qualification.filterFailures ? (
                  <>
                    <div className={styles.summaryBar}>
                      {[
                        { label: 'tasa de contacto', value: formatRate(contactados, leadsValidos) },
                        { label: 'lead válido → prospecto', value: formatRate(summary.prospecto, leadsValidos) },
                        { label: 'datos incompletos / contactados', value: formatRate(summary.datos_incompletos, contactados) },
                        { label: 'registros inválidos', value: formatRate(summary.lead_invalido, summary.total) },
                      ].map((stat) => (
                        <div className={styles.summaryStat} key={stat.label}>
                          <span className={styles.summaryValue}>{stat.value}</span>
                          <span className={styles.summaryLabel}>{stat.label}</span>
                        </div>
                      ))}
                    </div>
                    <p className={styles.motivosNote}>
                      No calificados por filtro: {countFormatter.format(data.qualification.filterFailures.f1)} no embarazada (F1) ·{' '}
                      {countFormatter.format(data.qualification.filterFailures.f2)} fuera de México (F2) ·{' '}
                      {countFormatter.format(data.qualification.filterFailures.f3)} bebé ya nacido (F3).
                    </p>
                  </>
                ) : null}
                <div className={styles.splitGrid}>
                  {(['online', 'offline'] as const).map((canal) => {
                    const canalRows = data.qualification.byMonth.filter((row) => row.canal === canal);
                    return (
                      <div key={canal}>
                        <h3 className={styles.splitTitle}>{canal === 'online' ? 'Online' : 'Offline'}</h3>
                        {canalRows.length === 0 ? (
                          <EmptyState message={`Sin leads ${canal} en este periodo.`} />
                        ) : (
                          <MarketingQualificationChart rows={canalRows} formatValue={(v) => countFormatter.format(v)} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>

          <div className={chartStyles.chartCard}>
            <h2 className={styles.panelTitle}>Leads contactados por mes (Online / Offline)</h2>
            <p className={styles.panelSubtitle}>
              {pais === 'AR'
                ? 'Prospecto + No calificado (excluye No contactado) - el lead fue alcanzado, sin importar el resultado.'
                : 'Prospecto + datos incompletos + No calificado - hubo conversación con el lead, sin importar el resultado.'}
            </p>
            {leadsContactadosByMonth.length === 0 ? (
              <EmptyState message="No hay leads en este periodo." />
            ) : (
              <MarketingSalesChart rows={leadsContactadosByMonth} formatValue={(v) => countFormatter.format(v)} />
            )}
          </div>

          <MarketingLeadsSection key={`${pais}-${marca}-${dateFrom}-${dateTo}`} pais={pais} dateFrom={dateFrom} dateTo={dateTo} marca={marca} />

          <MarketingTicketsSection dateFrom={dateFrom} dateTo={dateTo} />
        </div>
      ) : null}
    </AppShell>
  );
}
