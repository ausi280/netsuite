import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import chartStyles from '../components/charts/charts.module.css';
import { useAdministracionReport } from '../hooks/useAdministracionReport';
import type { AdministracionBrandStorage, AdministracionChurnRow } from '../api/types';
import styles from './CommissionsPage.module.css';
import pageStyles from './AdministracionReportPage.module.css';

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const COUNTRY_ORDER = ['México', 'Argentina', 'Perú'];

/** Report order of statuses; any other label NetSuite returns goes after these, alphabetically. */
const STATUS_ORDER = ['Activo', 'Almacenado', 'Seguridad total', 'Suspendido', 'Cancelado', 'Baja', 'Disposición', 'Retirado del tanque', 'Sin estatus'];
// Fixed color per status (never by rank), from the same categorical palette as the HR charts.
const STATUS_PALETTE = [
  'var(--color-primary)',
  'var(--color-neutral-800)',
  'var(--color-secondary)',
  'var(--color-neutral-300)',
  'var(--color-primary-tint1)',
  'var(--color-secondary-tint1)',
  'var(--color-primary-tint2)',
  'var(--color-secondary-tint2)',
  'var(--color-primary-tint3)',
];

type TipoKey = 'blood' | 'tissue';
const TIPO_LABELS: Record<TipoKey, string> = { blood: 'Sangre', tissue: 'Tejido' };

const fmt = new Intl.NumberFormat('es-MX');
const formatCount = (value: number) => fmt.format(value);
const formatPct = (value: number | null) => (value === null ? '—' : `${value.toLocaleString('es-MX', { maximumFractionDigits: 2 })}%`);

/** Local-time YYYY-MM-DD. */
function toDateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(value: string): string {
  const [y, m, d] = value.split('-');
  return `${d}/${m}/${y}`;
}

function sortStatuses(labels: Iterable<string>): string[] {
  const rank = (label: string) => {
    const i = STATUS_ORDER.indexOf(label);
    return i === -1 ? STATUS_ORDER.length : i;
  };
  return Array.from(new Set(labels)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function statusColor(label: string): string {
  const i = STATUS_ORDER.indexOf(label);
  return STATUS_PALETTE[(i === -1 ? STATUS_ORDER.length - 1 : i) % STATUS_PALETTE.length];
}

function byCountryOrder(a: string, b: string): number {
  const ia = COUNTRY_ORDER.indexOf(a);
  const ib = COUNTRY_ORDER.indexOf(b);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
}

/** Pivot `items` into rows (by `rowKey`) × status columns, summing `value` per cell. */
function pivotByStatus<T>(items: T[], rowKey: (item: T) => string, status: (item: T) => string, value: (item: T) => number) {
  const rows = new Map<string, Map<string, number>>();
  for (const item of items) {
    const row = rows.get(rowKey(item)) ?? new Map<string, number>();
    row.set(status(item), (row.get(status(item)) ?? 0) + value(item));
    rows.set(rowKey(item), row);
  }
  return rows;
}

function StatusSwatch({ label }: { label: string }) {
  return <span className={chartStyles.legendSwatch} style={{ backgroundColor: statusColor(label) }} aria-hidden="true" />;
}

interface BrandChartRow {
  brand: string;
  country: string;
  [status: string]: string | number;
}

function BrandStatusTooltip({ active, payload, statuses }: { active?: boolean; payload?: Array<{ payload?: BrandChartRow }>; statuses: string[] }) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className={chartStyles.tooltip} role="status">
      <p className={chartStyles.tooltipLabel}>
        {row.brand} · {row.country}
      </p>
      {statuses
        .filter((s) => Number(row[s] ?? 0) > 0)
        .map((s) => (
          <div className={chartStyles.tooltipRow} key={s}>
            <span className={chartStyles.tooltipKey} style={{ backgroundColor: statusColor(s) }} aria-hidden="true" />
            <span className={chartStyles.tooltipValue}>{formatCount(Number(row[s]))}</span>
            <span className={chartStyles.tooltipMetric}>{s}</span>
          </div>
        ))}
    </div>
  );
}

/** One horizontal bar per brand, one segment per status (Sangre or Tejido) - each status keeps its own color. */
function BrandStatusChart({ brands, statuses, tipo }: { brands: AdministracionBrandStorage[]; statuses: string[]; tipo: TipoKey }) {
  const data: BrandChartRow[] = brands.map((b) => {
    const row: BrandChartRow = { brand: b.brand, country: b.country };
    for (const s of b.byStatus) row[s.label] = s[tipo];
    return row;
  });
  return (
    <div>
      <div className={chartStyles.legendRow}>
        {statuses.map((s) => (
          <span className={chartStyles.legendItem} key={s}>
            <StatusSwatch label={s} />
            {s}
          </span>
        ))}
      </div>
      <div style={{ width: '100%', height: brands.length * 40 + 40 }} role="img" aria-label={`${TIPO_LABELS[tipo]} por marca y estatus`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
            <XAxis type="number" tickFormatter={formatCount} tick={{ fill: 'var(--chart-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="brand" width={110} interval={0} tick={{ fill: 'var(--chart-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'var(--color-primary-soft)' }} content={<BrandStatusTooltip statuses={statuses} />} />
            {statuses.map((s) => (
              <Bar
                key={s}
                dataKey={s}
                stackId="status"
                fill={statusColor(s)}
                stroke="var(--color-white)"
                strokeWidth={1}
                maxBarSize={20}
                animationDuration={450}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Rows × status columns; each status is its own count, there's no total column. */
function StatusTable({
  rowHeader,
  rows,
  statuses,
  extraHeader,
  cell,
}: {
  rowHeader: string;
  rows: Array<{ key: string; label: string; extra?: string }>;
  statuses: string[];
  extraHeader?: string;
  cell: (rowKey: string, status: string) => string;
}) {
  return (
    <div className={pageStyles.tableWrapper}>
      <table className={chartStyles.table}>
        <thead>
          <tr>
            <th>{rowHeader}</th>
            {extraHeader ? <th>{extraHeader}</th> : null}
            {statuses.map((s) => (
              <th key={s}>
                <span className={pageStyles.statusHead}>
                  <StatusSwatch label={s} />
                  {s}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td>
              {extraHeader ? <td>{r.extra}</td> : null}
              {statuses.map((s) => (
                <td key={s}>{cell(r.key, s)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Reporte Administración - every figure comes from NetSuite (see
 * api/src-ts/reporting/administracionRepository.ts):
 * - Core: Sangre/Tejido servicios as of the chosen month's last day, by brand (subsidiaria), with
 *   every servicio status (Activo, Almacenado, Seguridad total, Suspendido, Cancelado, Disposición...)
 *   counted on its own - statuses are never summed into one total.
 * - Fcells: the Fcells record plus Fibroblastos/Mesenquimal servicios. Placenta: Placenta servicios.
 *   Both also split by status.
 * - Abandonos: contract-level churn for the three Mexico brands over a date range.
 * Brazil and Colombia have no subsidiaria in NetSuite, so they're not in the report.
 */
export function AdministracionReportPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [churnFrom, setChurnFrom] = useState(toDateOnly(new Date(now.getFullYear(), 0, 1)));
  const [churnTo, setChurnTo] = useState(toDateOnly(now));
  const [chartTipo, setChartTipo] = useState<TipoKey>('blood');

  const { data, isLoading, isFetching, isError, error, refetch } = useAdministracionReport({ month, year, churnFrom, churnTo });
  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);

  const view = useMemo(() => {
    if (!data) return null;
    const { brands, fcells, placenta } = data.storage;
    const coreStatuses = sortStatuses(brands.flatMap((b) => b.byStatus.map((s) => s.label)));
    const coreItems = brands.flatMap((b) => b.byStatus.map((s) => ({ ...s, brand: b.brand, country: b.country, subsidiaria: b.subsidiaria })));
    const coreBlood = pivotByStatus(coreItems, () => 'all', (i) => i.label, (i) => i.blood).get('all') ?? new Map<string, number>();
    const coreTissue = pivotByStatus(coreItems, () => 'all', (i) => i.label, (i) => i.tissue).get('all') ?? new Map<string, number>();
    const countryBlood = pivotByStatus(coreItems, (i) => i.country, (i) => i.label, (i) => i.blood);
    const countryTissue = pivotByStatus(coreItems, (i) => i.country, (i) => i.label, (i) => i.tissue);
    const countries = Array.from(countryBlood.keys()).sort(byCountryOrder);

    const fcellsStatuses = sortStatuses(fcells.map((f) => f.status));
    const fcellsByCategory = pivotByStatus(fcells, (f) => f.category, (f) => f.status, (f) => f.n);
    const fcellsByCountry = pivotByStatus(fcells, (f) => f.country, (f) => f.status, (f) => f.n);
    const fcellsCategories = Array.from(fcellsByCategory.keys()).sort();
    const fcellsCountries = Array.from(fcellsByCountry.keys()).sort(byCountryOrder);

    const placentaStatuses = sortStatuses(placenta.map((p) => p.status));
    const placentaByCountry = pivotByStatus(placenta, (p) => p.country, (p) => p.status, (p) => p.n);
    const placentaCountries = Array.from(placentaByCountry.keys()).sort(byCountryOrder);

    return {
      brands,
      coreStatuses,
      coreBlood,
      coreTissue,
      countries,
      countryBlood,
      countryTissue,
      fcellsStatuses,
      fcellsByCategory,
      fcellsByCountry,
      fcellsCategories,
      fcellsCountries,
      placentaStatuses,
      placentaByCountry,
      placentaCountries,
    };
  }, [data]);

  const periodLabel = `${MONTH_NAMES[month - 1]} ${year}`;
  const cellOf = (map: Map<string, Map<string, number>>) => (rowKey: string, status: string) => {
    const value = map.get(rowKey)?.get(status);
    return value ? formatCount(value) : '—';
  };

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: 'Reporte Administración' }]}>
      <div className={styles.heading}>
        <div>
          <h1 className={styles.title}>Reporte Administración</h1>
          <p className={styles.subtitle}>Almacenamiento por estatus y abandonos por marca, desde los servicios de NetSuite.</p>
        </div>
      </div>

      <div className={styles.filters}>
        <select className={styles.select} value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Mes">
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <select className={styles.select} value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Año">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        {isFetching && data ? <span className={pageStyles.hint}>Actualizando…</span> : null}
      </div>

      {isLoading && !data ? <LoadingState label="Cargando reporte de administración..." /> : null}
      {isError ? (
        <ErrorState message={error instanceof Error ? error.message : 'No se pudo cargar el reporte.'} onRetry={() => refetch()} />
      ) : null}

      {data && view ? (
        <div className={pageStyles.stack}>
          <h2 className={pageStyles.sectionTitle}>
            Consolidado <span className={pageStyles.accent}>Core</span>
            <span className={pageStyles.sectionMeta}>al {formatDate(data.storage.cutoff)} · cada estatus se cuenta por separado</span>
          </h2>
          <div className={pageStyles.twoCol}>
            <section className={chartStyles.chartCard}>
              <h3 className={pageStyles.cardTitle}>{periodLabel} · Core por estatus</h3>
              <div className={pageStyles.tableWrapper}>
                <table className={chartStyles.table}>
                  <thead>
                    <tr>
                      <th>Estatus</th>
                      <th>Sangre</th>
                      <th>Tejido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.coreStatuses.map((s) => (
                      <tr key={s}>
                        <td>
                          <span className={pageStyles.statusHead}>
                            <StatusSwatch label={s} />
                            {s}
                          </span>
                        </td>
                        <td>{formatCount(view.coreBlood.get(s) ?? 0)}</td>
                        <td>{formatCount(view.coreTissue.get(s) ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className={chartStyles.chartCard}>
              <h3 className={pageStyles.cardTitle}>{periodLabel} · Core por país (sangre / tejido)</h3>
              <StatusTable
                rowHeader="País"
                rows={view.countries.map((c) => ({ key: c, label: c }))}
                statuses={view.coreStatuses}
                cell={(country, s) => `${formatCount(view.countryBlood.get(country)?.get(s) ?? 0)} / ${formatCount(view.countryTissue.get(country)?.get(s) ?? 0)}`}
              />
            </section>
          </div>

          <section className={chartStyles.chartCard}>
            <div className={pageStyles.cardHeader}>
              <h3 className={pageStyles.cardTitle}>
                {periodLabel} · {TIPO_LABELS[chartTipo]} por marca y estatus
              </h3>
              <select className={styles.select} value={chartTipo} onChange={(e) => setChartTipo(e.target.value as TipoKey)} aria-label="Tipo de servicio">
                <option value="blood">Sangre</option>
                <option value="tissue">Tejido</option>
              </select>
            </div>
            <BrandStatusChart brands={view.brands} statuses={view.coreStatuses} tipo={chartTipo} />
            <h4 className={pageStyles.subTitle}>Por marca y estatus (sangre / tejido)</h4>
            <StatusTable
              rowHeader="Marca"
              extraHeader="País"
              rows={view.brands.map((b) => ({ key: b.subsidiaria, label: b.brand, extra: b.country }))}
              statuses={view.coreStatuses}
              cell={(sub, s) => {
                const entry = view.brands.find((b) => b.subsidiaria === sub)?.byStatus.find((x) => x.label === s);
                return entry ? `${formatCount(entry.blood)} / ${formatCount(entry.tissue)}` : '—';
              }}
            />
          </section>

          <h2 className={pageStyles.sectionTitle}>
            Consolidado <span className={pageStyles.accent}>Fcells</span>
          </h2>
          <section className={chartStyles.chartCard}>
            <h3 className={pageStyles.cardTitle}>{periodLabel} · Fcells por tipo y estatus</h3>
            <StatusTable
              rowHeader="Tipo"
              rows={view.fcellsCategories.map((c) => ({ key: c, label: c }))}
              statuses={view.fcellsStatuses}
              cell={cellOf(view.fcellsByCategory)}
            />
            <h4 className={pageStyles.subTitle}>Por país y estatus</h4>
            <StatusTable
              rowHeader="País"
              rows={view.fcellsCountries.map((c) => ({ key: c, label: c }))}
              statuses={view.fcellsStatuses}
              cell={cellOf(view.fcellsByCountry)}
            />
            <p className={pageStyles.hint}>Baja es el estatus del registro Fcells; el resto viene del estatus del servicio.</p>
          </section>

          <h2 className={pageStyles.sectionTitle}>
            Consolidado <span className={pageStyles.accent}>Placenta</span>
          </h2>
          <section className={chartStyles.chartCard}>
            {view.placentaCountries.length === 0 ? (
              <p className={pageStyles.center}>Sin servicios de placenta</p>
            ) : (
              <StatusTable
                rowHeader="País"
                rows={view.placentaCountries.map((c) => ({ key: c, label: c }))}
                statuses={view.placentaStatuses}
                cell={cellOf(view.placentaByCountry)}
              />
            )}
          </section>

          <h2 className={pageStyles.sectionTitle}>
            <span className={pageStyles.accent}>Abandonos</span> y crecimiento
          </h2>
          <section className={chartStyles.chartCard}>
            <div className={styles.filters}>
              <label className={pageStyles.inline}>
                Desde
                <input type="date" className={styles.select} value={churnFrom} max={churnTo} onChange={(e) => e.target.value && setChurnFrom(e.target.value)} />
              </label>
              <label className={pageStyles.inline}>
                Hasta
                <input type="date" className={styles.select} value={churnTo} min={churnFrom} onChange={(e) => e.target.value && setChurnTo(e.target.value)} />
              </label>
            </div>
            <ChurnTable rows={data.churn.rows} />
            <ul className={pageStyles.notes}>
              <li>
                <strong>Inicio:</strong> contratos con servicio de sangre, tejido o ADN que ya estaban antes de la fecha inicial, sin contar cancelados,
                suspendidos ni disposiciones.
              </li>
              <li>
                <strong>Abandonos:</strong> contratos cancelados dentro del periodo. NetSuite registra la fecha de cancelación desde octubre 2026, así que
                antes de esa fecha casi no aparecen abandonos. Las suspensiones no tienen fecha en NetSuite y no se cuentan como abandono.
              </li>
              <li>
                <strong>Nuevos:</strong> contratos cuyo primer servicio se procesó en el periodo (o, sin fecha de proceso, la fecha de alta o de nacimiento,
                la que sea antes).
              </li>
              <li>
                <strong>Abandonos vs nuevos:</strong> 100 − abandonos × 100 ÷ nuevos, igual que el reporte anterior.
              </li>
            </ul>
          </section>

          <p className={pageStyles.hint}>
            El estatus de cada servicio es el actual en NetSuite (no guarda historial); un mes pasado solo filtra por fecha de proceso. Brasil y
            Colombia no tienen subsidiaria en NetSuite y no aparecen.
          </p>
        </div>
      ) : null}
    </AppShell>
  );
}

function ChurnTable({ rows }: { rows: AdministracionChurnRow[] }) {
  return (
    <div className={pageStyles.tableWrapper}>
      <table className={chartStyles.table}>
        <thead>
          <tr>
            <th>Empresa</th>
            <th>Inicio</th>
            <th>Abandonos</th>
            <th>Tasa abandono</th>
            <th>Nuevos</th>
            <th>Final</th>
            <th>Tasa crecimiento</th>
            <th>Abandonos vs nuevos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.subsidiaria}>
              <td>{r.brand}</td>
              <td>{formatCount(r.inicio)}</td>
              <td>{formatCount(r.abandonos)}</td>
              <td>{formatPct(r.tasaAbandono)}</td>
              <td>{formatCount(r.nuevos)}</td>
              <td>{formatCount(r.final)}</td>
              <td>{formatPct(r.tasaCrecimiento)}</td>
              <td>{formatPct(r.abandonosVsNuevos)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
