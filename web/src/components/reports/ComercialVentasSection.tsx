import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SimpleTable } from '../table/SimpleTable';
import type { SimpleColumn } from '../table/SimpleTable';
import { LoadingState } from '../common/LoadingState';
import { ErrorState } from '../common/ErrorState';
import { EmptyState } from '../common/EmptyState';
import chartStyles from '../charts/charts.module.css';
import { useComercialVentas } from '../../hooks/useComercialVentas';
import type { VentasZonaEjecutivoRow } from '../../api/types';
import styles from '../../pages/ComercialReportPage.module.css';

const countFormatter = new Intl.NumberFormat('es-MX');
const moneyFormatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const TODAS = '';

interface Totals {
  core_unidades: number;
  core_monto: number;
  genetica_unidades: number;
  genetica_monto: number;
}

function sumRows(rows: VentasZonaEjecutivoRow[]): Totals {
  return rows.reduce(
    (t, r) => ({
      core_unidades: t.core_unidades + r.core_unidades,
      core_monto: t.core_monto + r.core_monto,
      genetica_unidades: t.genetica_unidades + r.genetica_unidades,
      genetica_monto: t.genetica_monto + r.genetica_monto,
    }),
    { core_unidades: 0, core_monto: 0, genetica_unidades: 0, genetica_monto: 0 },
  );
}

interface PortafolioRow {
  portafolio: string;
  unidades: number;
  monto: number;
}

const PORTAFOLIO_COLUMNS: SimpleColumn<PortafolioRow>[] = [
  { key: 'portafolio', header: 'Portafolio', render: (r) => r.portafolio },
  { key: 'monto', header: 'Venta', render: (r) => moneyFormatter.format(r.monto) },
  { key: 'unidades', header: 'Unidades', render: (r) => countFormatter.format(r.unidades) },
];

const EJECUTIVO_COLUMNS: SimpleColumn<VentasZonaEjecutivoRow>[] = [
  { key: 'ejecutivo', header: 'Ejecutivo', render: (r) => r.ejecutivo },
  { key: 'core_unidades', header: 'Core (#)', render: (r) => countFormatter.format(r.core_unidades) },
  { key: 'core_monto', header: 'Core ($)', render: (r) => moneyFormatter.format(r.core_monto) },
  { key: 'genetica_unidades', header: 'Genética (#)', render: (r) => countFormatter.format(r.genetica_unidades) },
  { key: 'genetica_monto', header: 'Genética ($)', render: (r) => moneyFormatter.format(r.genetica_monto) },
  { key: 'total', header: 'Total ($)', render: (r) => moneyFormatter.format(r.core_monto + r.genetica_monto) },
];

/**
 * "Ventas por zona" - core (CryoWeb contracts) and genetics (NetSuite Otros Contratos) sales in the page's
 * own Desde/Hasta range, for one zona (or all of them) and per ejecutivo. The zona is kept in the
 * URL (?zona=) so a manager can bookmark their own. See
 * api/src-ts/reporting/comercialVentasRepository.ts for where the zona, the ejecutivo and the
 * amounts come from, and why $0 sales are left out.
 */
export function ComercialVentasSection({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const zona = searchParams.get('zona') ?? TODAS;

  const { data, isLoading, isError, error, refetch } = useComercialVentas(dateFrom, dateTo);

  function setZona(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('zona', value);
    else next.delete('zona');
    setSearchParams(next, { replace: true });
  }

  const zonas = useMemo(() => Array.from(new Set((data?.rows ?? []).map((r) => r.zona))).sort((a, b) => a.localeCompare(b)), [data]);
  const zonaRows = useMemo(() => (data?.rows ?? []).filter((r) => zona === TODAS || r.zona === zona), [data, zona]);

  // With every zona selected, the same person can show in several (their sales in each zona) -
  // combined into one line per ejecutivo here.
  const ejecutivoRows = useMemo(() => {
    const byEjecutivo = new Map<string, VentasZonaEjecutivoRow>();
    for (const row of zonaRows) {
      const existing = byEjecutivo.get(row.ejecutivo);
      byEjecutivo.set(row.ejecutivo, existing ? { ...existing, ...sumRows([existing, row]) } : row);
    }
    return Array.from(byEjecutivo.values()).sort((a, b) => b.core_monto + b.genetica_monto - (a.core_monto + a.genetica_monto));
  }, [zonaRows]);

  const totals = sumRows(zonaRows);
  const portafolioRows: PortafolioRow[] = [
    { portafolio: 'Core', unidades: totals.core_unidades, monto: totals.core_monto },
    { portafolio: 'Genética', unidades: totals.genetica_unidades, monto: totals.genetica_monto },
    { portafolio: 'Total', unidades: totals.core_unidades + totals.genetica_unidades, monto: totals.core_monto + totals.genetica_monto },
  ];
  const ejecutivoTotal: VentasZonaEjecutivoRow = { zona, ejecutivo: 'Total', ...totals };

  return (
    <div className={chartStyles.chartCard}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>Ventas por zona</h2>
          <p className={styles.panelSubtitle}>
            Ventas del periodo seleccionado arriba (Desde / Hasta). Core = contratos de CryoWeb (sin cancelados), por fecha de venta. Genética = otros
            contratos de NetSuite, por su fecha. Montos en MXN con IVA; las ventas de $0 no se muestran. Solo México.
          </p>
        </div>
      </div>

      <div className={styles.dateFilters}>
        <label className={styles.dateLabel}>
          Zona
          <select className={styles.dateInput} value={zona} onChange={(event) => setZona(event.target.value)}>
            <option value={TODAS}>Todas</option>
            {zona !== TODAS && !zonas.includes(zona) ? <option value={zona}>{zona}</option> : null}
            {zonas.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && !data ? <LoadingState label="Cargando ventas..." /> : null}
      {isError ? <ErrorState message={error instanceof Error ? error.message : 'No se pudieron cargar las ventas.'} onRetry={() => refetch()} /> : null}

      {!isError && data ? (
        <>
          {data.core_sin_monto + data.genetica_sin_monto > 0 ? (
            <p className={styles.panelSubtitle}>
              En todo México en el periodo:{' '}
              {[
                data.core_sin_monto > 0 ? `${countFormatter.format(data.core_sin_monto)} contratos core de $0 ocultos` : null,
                data.genetica_sin_monto > 0 ? `${countFormatter.format(data.genetica_sin_monto)} ventas de genética de $0 ocultas (cortesías)` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              .
            </p>
          ) : null}
          <div className={styles.splitGrid}>
            <div>
              <h3 className={styles.splitTitle}>{zona === TODAS ? 'Todas las zonas' : zona}</h3>
              <SimpleTable columns={PORTAFOLIO_COLUMNS} rows={portafolioRows} getRowKey={(row) => row.portafolio} />
            </div>
          </div>

          <h3 className={styles.splitTitle} style={{ marginTop: 20 }}>
            Por ejecutivo
          </h3>
          {ejecutivoRows.length === 0 ? (
            <EmptyState message="Sin ventas en esta zona en el periodo." />
          ) : (
            <SimpleTable columns={EJECUTIVO_COLUMNS} rows={[...ejecutivoRows, ejecutivoTotal]} getRowKey={(row) => row.ejecutivo} />
          )}
        </>
      ) : null}
    </div>
  );
}
