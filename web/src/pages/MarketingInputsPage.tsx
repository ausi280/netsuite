import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { MarketingMonthlyInputs, MarketingPais } from '../api/types';
import { MARKETING_PAISES, parseMarketingPais } from '../utils/marketingPais';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { useMarketingInputs, useSaveMarketingInputs } from '../hooks/useMarketingInputs';
import chartStyles from '../components/charts/charts.module.css';
import goalStyles from '../components/reports/CobranzaGoalsSection.module.css';
import styles from './CommissionsPage.module.css';
import inputStyles from './MarketingInputsPage.module.css';
import { META_PROSPECTOS_RATE, metaProspectosFor } from '../utils/marketingFunnel';

const PROSPECTOS_PCT = Math.round(META_PROSPECTOS_RATE * 100);

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const CURRENT_YEAR = new Date().getFullYear();
// Includes next year - metas are often captured ahead of time.
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, index) => CURRENT_YEAR + 1 - index);

type Field = keyof Omit<MarketingMonthlyInputs, 'year' | 'month'>;

const COLUMNS: Array<{ field: Field; label: string; money: boolean; computed?: boolean }> = [
  { field: 'inversion_digital', label: 'Inversión digital (real)', money: true },
  { field: 'meta_inversion_digital', label: 'Presupuesto inversión', money: true },
  { field: 'meta_leads_digital', label: 'Meta leads digital', money: false },
  { field: 'meta_leads_offline', label: 'Meta leads offline', money: false },
  // Not captured - always a fixed % of meta leads digital (see metaProspectosFor).
  { field: 'meta_prospectos', label: `Meta prospectos (${PROSPECTOS_PCT}% leads digital)`, money: false, computed: true },
  { field: 'meta_ventas_digital', label: 'Meta ventas digital', money: false },
  { field: 'meta_ventas_total', label: 'Meta ventas totales', money: false },
];

type Draft = Record<Field, string>;

const toDraft = (row: MarketingMonthlyInputs): Draft =>
  Object.fromEntries(COLUMNS.map(({ field }) => [field, row[field] === null ? '' : String(row[field])])) as Draft;

/** '' -> null, a non-negative number -> it, anything else -> undefined (invalid). */
function parse(raw: string): number | null | undefined {
  const trimmed = raw.trim().replace(/,/g, '');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** One month - edited locally, saved with its own button, so a half-filled row never overwrites
 * anything until it's explicitly saved. */
function MonthRow({ row, canEdit, pais }: { row: MarketingMonthlyInputs; canEdit: boolean; pais: MarketingPais }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(row));
  const save = useSaveMarketingInputs(pais);

  const leadsDigital = parse(draft.meta_leads_digital);
  const metaProspectos = leadsDigital === undefined ? null : metaProspectosFor(leadsDigital);
  const parsed = COLUMNS.map(({ field, computed }) => [field, computed ? metaProspectos : parse(draft[field])] as const);
  const invalid = parsed.some(([, v]) => v === undefined);
  // The computed column counts too - a month saved before the rule gets re-saved with it.
  const dirty = parsed.some(([field, value]) => value !== row[field]);

  function handleSave() {
    if (invalid) return;
    const input = { year: row.year, month: row.month } as MarketingMonthlyInputs;
    for (const [field, value] of parsed) input[field] = value as number | null;
    save.mutate(input);
  }

  return (
    <tr>
      <td className={inputStyles.monthCell}>{MONTH_NAMES[row.month - 1]}</td>
      {COLUMNS.map(({ field, label, money, computed }) => (
        <td key={field}>
          {computed ? (
            <span className={inputStyles.computedCell} title={`${PROSPECTOS_PCT}% de la meta de leads digital`}>
              {metaProspectos === null ? '—' : metaProspectos.toLocaleString('es-MX')}
            </span>
          ) : (
            <input
              className={`${goalStyles.input} ${inputStyles.cellInput} ${parse(draft[field]) === undefined ? inputStyles.invalid : ''}`}
              type="text"
              inputMode="decimal"
              placeholder={money ? '$' : '—'}
              value={draft[field]}
              disabled={!canEdit || save.isPending}
              onChange={(event) => setDraft((prev) => ({ ...prev, [field]: event.target.value }))}
              aria-label={`${label}, ${MONTH_NAMES[row.month - 1]} ${row.year}`}
            />
          )}
        </td>
      ))}
      {canEdit ? (
        <td className={inputStyles.actionCell}>
          <button type="button" className={goalStyles.primaryButton} onClick={handleSave} disabled={!dirty || invalid || save.isPending}>
            {save.isPending ? 'Guardando...' : 'Guardar'}
          </button>
          {save.isError ? (
            <span className={goalStyles.statusError} role="status">
              {save.error instanceof Error ? save.error.message : 'No se pudo guardar'}
            </span>
          ) : save.isSuccess && !dirty ? (
            <span className={goalStyles.status} role="status">
              Guardado
            </span>
          ) : null}
        </td>
      ) : null}
    </tr>
  );
}

/**
 * Monthly capture of the México marketing funnel's inputs that don't exist in any system: the real
 * digital spend and every meta (inversión, leads digital/offline, ventas digital/totales). Meta
 * prospectos is not captured - it is computed from meta leads digital (metaProspectosFor). Captured per country (?pais=MX|AR). The real lead/prospecto/sale counts come from the CRM / NetSuite - see
 * api/src-ts/reporting/marketingInputsRepository.ts. Editing requires the 'marketing_inputs'
 * grant; anyone who can see the Marketing report can view it.
 */
export function MarketingInputsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const year = Number(searchParams.get('year')) || CURRENT_YEAR;
  const pais = parseMarketingPais(searchParams.get('pais'));
  const config = MARKETING_PAISES[pais];
  const { data, isLoading, isError, error, refetch } = useMarketingInputs(pais, year);

  function handleParamChange(key: 'year' | 'pais', value: string) {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next);
  }

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: 'Marketing', to: `/reports/marketing?pais=${pais}` }, { label: 'Inversión y metas' }]}>
      <div className={styles.heading}>
        <div>
          <h1 className={styles.title}>Inversión y metas de Marketing · {config.label}</h1>
          <p className={styles.subtitle}>
            Captura mensual de la inversión digital ({config.currency}) y las metas del funnel. Los leads, prospectos y ventas reales salen del{' '}
            {config.fuente}.
          </p>
        </div>
      </div>

      <div className={styles.filters}>
        <select className={styles.select} value={pais} onChange={(event) => handleParamChange('pais', event.target.value)} aria-label="País">
          {(Object.keys(MARKETING_PAISES) as MarketingPais[]).map((key) => (
            <option key={key} value={key}>
              {MARKETING_PAISES[key].label}
            </option>
          ))}
        </select>
        <select className={styles.select} value={year} onChange={(event) => handleParamChange('year', event.target.value)} aria-label="Año">
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? <LoadingState label="Cargando..." /> : null}
      {isError ? <ErrorState message={error instanceof Error ? error.message : 'No se pudo cargar la captura.'} onRetry={() => refetch()} /> : null}

      {data ? (
        <section className={chartStyles.chartCard}>
          {!data.canEdit ? <EmptyState message="Solo lectura - no tienes permiso para capturar inversión y metas de Marketing." /> : null}
          <div className={inputStyles.tableWrapper}>
            <table className={chartStyles.table}>
              <thead>
                <tr>
                  <th>Mes</th>
                  {COLUMNS.map(({ field, label }) => (
                    <th key={field}>{label}</th>
                  ))}
                  {data.canEdit ? <th aria-label="Acciones" /> : null}
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => (
                  <MonthRow key={`${pais}-${year}-${row.month}`} row={row} canEdit={data.canEdit} pais={pais} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
