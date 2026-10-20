import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  INCENTIVE_RATE_COLUMNS,
  type CobranzaIncentiveConfig,
  type CobranzaIncentiveTier,
  type CobranzaProyectoIncentiveTier,
  type IncentiveRateKey,
} from '../api/types';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { useCobranzaIncentives, useSaveCobranzaIncentives } from '../hooks/useCobranzaIncentives';
import chartStyles from '../components/charts/charts.module.css';
import styles from './CommissionsPage.module.css';
import goalStyles from '../components/reports/CobranzaGoalsSection.module.css';
import incentiveStyles from './CobranzaIncentivesPage.module.css';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const CURRENT_YEAR = new Date().getFullYear();
// Includes next year too - configuration is typically captured ahead of the month it applies to.
const YEAR_OPTIONS = Array.from({ length: 7 }, (_, index) => CURRENT_YEAR + 1 - index);

// The editor works on strings so a half-typed number ("1.", "") doesn't get coerced mid-edit.
type TierDraft = { min_pct: string; incentive_label: string } & Record<IncentiveRateKey, string>;
type ProyectoDraft = { min_amount: string; rate_pct: string };

const numToInput = (value: number | null) => (value === null ? '' : String(value));

function tierToDraft(tier: CobranzaIncentiveTier): TierDraft {
  const draft = { min_pct: String(tier.min_pct), incentive_label: tier.incentive_label ?? '' } as TierDraft;
  for (const { key } of INCENTIVE_RATE_COLUMNS) draft[key] = numToInput(tier[key]);
  return draft;
}

function emptyTier(): TierDraft {
  const draft = { min_pct: '', incentive_label: '' } as TierDraft;
  for (const { key } of INCENTIVE_RATE_COLUMNS) draft[key] = '';
  return draft;
}

/** '' -> null; a non-negative number -> it; anything else -> undefined (invalid). */
function parseInput(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Validates and converts the drafts - returns an error message instead when something's off. */
function buildConfig(month: number, year: number, tiers: TierDraft[], proyecto: ProyectoDraft[]): CobranzaIncentiveConfig | string {
  const outTiers: CobranzaIncentiveTier[] = [];
  for (const [index, draft] of tiers.entries()) {
    const minPct = parseInput(draft.min_pct);
    if (minPct === null || minPct === undefined) return `Fila ${index + 1}: captura el % recuperado mínimo.`;
    const tier = { min_pct: minPct, incentive_label: draft.incentive_label.trim() || null } as CobranzaIncentiveTier;
    for (const { key, label } of INCENTIVE_RATE_COLUMNS) {
      const rate = parseInput(draft[key]);
      if (rate === undefined) return `Fila ${index + 1}: ${label} no es un porcentaje válido.`;
      tier[key] = rate;
    }
    outTiers.push(tier);
  }
  if (new Set(outTiers.map((t) => t.min_pct)).size !== outTiers.length) return 'Hay dos filas con el mismo % recuperado.';

  const outProyecto: CobranzaProyectoIncentiveTier[] = [];
  for (const [index, draft] of proyecto.entries()) {
    const minAmount = parseInput(draft.min_amount);
    const ratePct = parseInput(draft.rate_pct);
    if (minAmount === null || minAmount === undefined || ratePct === null || ratePct === undefined) {
      return `Proyecto, fila ${index + 1}: captura el monto mínimo y el porcentaje.`;
    }
    outProyecto.push({ min_amount: minAmount, rate_pct: ratePct });
  }
  if (new Set(outProyecto.map((t) => t.min_amount)).size !== outProyecto.length) return 'Proyecto: hay dos filas con el mismo monto mínimo.';

  return {
    month,
    year,
    tiers: outTiers.sort((a, b) => a.min_pct - b.min_pct),
    proyecto_tiers: outProyecto.sort((a, b) => a.min_amount - b.min_amount),
  };
}

/** "70% al 79.99%" - each tier runs up to just below the next one; the last is open-ended. */
function rangeLabel(tiers: TierDraft[], index: number): string {
  const min = parseInput(tiers[index].min_pct);
  if (min === null || min === undefined) return '';
  const higher = tiers
    .map((t) => parseInput(t.min_pct))
    .filter((v): v is number => typeof v === 'number' && v > min)
    .sort((a, b) => a - b)[0];
  return higher === undefined ? `${min}% o más` : `${min}% al ${(higher - 0.01).toFixed(2)}%`;
}

function proyectoRangeLabel(rows: ProyectoDraft[], index: number): string {
  const min = parseInput(rows[index].min_amount);
  if (min === null || min === undefined) return '';
  const higher = rows
    .map((r) => parseInput(r.min_amount))
    .filter((v): v is number => typeof v === 'number' && v > min)
    .sort((a, b) => a - b)[0];
  const fmt = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
  return higher === undefined ? `${fmt(min)} o más` : `Menos de ${fmt(higher)}`;
}

function IncentivesEditor({
  month,
  year,
  initial,
  copiedFrom,
}: {
  month: number;
  year: number;
  initial: CobranzaIncentiveConfig | null;
  copiedFrom: { month: number; year: number } | null;
}) {
  const [tiers, setTiers] = useState<TierDraft[]>(() => (initial?.tiers.length ? initial.tiers.map(tierToDraft) : [emptyTier()]));
  const [proyecto, setProyecto] = useState<ProyectoDraft[]>(() =>
    initial?.proyecto_tiers.length
      ? initial.proyecto_tiers.map((t) => ({ min_amount: String(t.min_amount), rate_pct: String(t.rate_pct) }))
      : [{ min_amount: '0', rate_pct: '' }],
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const save = useSaveCobranzaIncentives();

  function updateTier(index: number, key: keyof TierDraft, value: string) {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, [key]: value } : t)));
  }

  function updateProyecto(index: number, key: keyof ProyectoDraft, value: string) {
    setProyecto((prev) => prev.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  }

  function handleSave() {
    const config = buildConfig(month, year, tiers, proyecto);
    if (typeof config === 'string') {
      setValidationError(config);
      return;
    }
    setValidationError(null);
    save.mutate(config);
  }

  const status = save.isPending
    ? 'Guardando...'
    : save.isError
      ? save.error instanceof Error
        ? save.error.message
        : 'No se pudo guardar'
      : save.isSuccess
        ? 'Guardado'
        : null;

  return (
    <>
      {copiedFrom ? (
        <p className={incentiveStyles.notice}>
          Este mes aún no tiene incentivos guardados. Se muestran los de {MONTH_NAMES[copiedFrom.month - 1]} {copiedFrom.year} como punto de
          partida - revisa y presiona Guardar para aplicarlos a {MONTH_NAMES[month - 1]} {year}.
        </p>
      ) : null}

      <section className={`${chartStyles.chartCard} ${goalStyles.section}`}>
        <div>
          <h2 className={goalStyles.title}>Agentes de cobranza</h2>
          <p className={goalStyles.subtitle}>
            Porcentaje pagado según el % recuperado de la meta, por esquema del agente. Cada fila aplica desde su % recuperado hasta antes
            de la siguiente.
          </p>
        </div>
        <div className={goalStyles.tableWrapper}>
          <table className={chartStyles.table}>
            <thead>
              <tr>
                <th>% recuperado desde</th>
                <th>Rango</th>
                <th>% de incentivo</th>
                {INCENTIVE_RATE_COLUMNS.map(({ key, label }) => (
                  <th key={key}>{label}</th>
                ))}
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier, index) => (
                <tr key={index}>
                  <td>
                    <input
                      className={`${goalStyles.input} ${incentiveStyles.narrowInput}`}
                      type="number"
                      min="0"
                      step="any"
                      value={tier.min_pct}
                      onChange={(event) => updateTier(index, 'min_pct', event.target.value)}
                      aria-label={`% recuperado mínimo, fila ${index + 1}`}
                    />
                  </td>
                  <td className={incentiveStyles.rangeCell}>{rangeLabel(tiers, index)}</td>
                  <td>
                    <input
                      className={`${goalStyles.input} ${incentiveStyles.labelInput}`}
                      type="text"
                      maxLength={50}
                      value={tier.incentive_label}
                      onChange={(event) => updateTier(index, 'incentive_label', event.target.value)}
                      aria-label={`% de incentivo, fila ${index + 1}`}
                    />
                  </td>
                  {INCENTIVE_RATE_COLUMNS.map(({ key, label }) => (
                    <td key={key}>
                      <input
                        className={`${goalStyles.input} ${incentiveStyles.narrowInput}`}
                        type="number"
                        min="0"
                        step="any"
                        value={tier[key]}
                        onChange={(event) => updateTier(index, key, event.target.value)}
                        aria-label={`${label}, fila ${index + 1}`}
                      />
                    </td>
                  ))}
                  <td>
                    <button type="button" className={goalStyles.linkButton} onClick={() => setTiers((prev) => prev.filter((_, i) => i !== index))}>
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <button type="button" className={goalStyles.linkButton} onClick={() => setTiers((prev) => [...prev, emptyTier()])}>
            + Agregar fila
          </button>
        </div>
      </section>

      <section className={`${chartStyles.chartCard} ${goalStyles.section}`}>
        <div>
          <h2 className={goalStyles.title}>Agentes de proyecto</h2>
          <p className={goalStyles.subtitle}>Porcentaje pagado según el monto cobrado del proyecto. Cada fila aplica desde su monto mínimo.</p>
        </div>
        <div className={goalStyles.tableWrapper}>
          <table className={chartStyles.table}>
            <thead>
              <tr>
                <th>Monto desde (MXN)</th>
                <th>Rango</th>
                <th>% que gana</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {proyecto.map((row, index) => (
                <tr key={index}>
                  <td>
                    <input
                      className={goalStyles.input}
                      type="number"
                      min="0"
                      step="any"
                      value={row.min_amount}
                      onChange={(event) => updateProyecto(index, 'min_amount', event.target.value)}
                      aria-label={`Monto mínimo, fila ${index + 1}`}
                    />
                  </td>
                  <td className={incentiveStyles.rangeCell}>{proyectoRangeLabel(proyecto, index)}</td>
                  <td>
                    <input
                      className={`${goalStyles.input} ${incentiveStyles.narrowInput}`}
                      type="number"
                      min="0"
                      step="any"
                      value={row.rate_pct}
                      onChange={(event) => updateProyecto(index, 'rate_pct', event.target.value)}
                      aria-label={`Porcentaje, fila ${index + 1}`}
                    />
                  </td>
                  <td>
                    <button type="button" className={goalStyles.linkButton} onClick={() => setProyecto((prev) => prev.filter((_, i) => i !== index))}>
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <button type="button" className={goalStyles.linkButton} onClick={() => setProyecto((prev) => [...prev, { min_amount: '', rate_pct: '' }])}>
            + Agregar fila
          </button>
        </div>
      </section>

      <div className={incentiveStyles.saveBar}>
        <button type="button" className={goalStyles.primaryButton} onClick={handleSave} disabled={save.isPending}>
          {save.isPending ? 'Guardando...' : `Guardar ${MONTH_NAMES[month - 1]} ${year}`}
        </button>
        {validationError ? (
          <span className={goalStyles.statusError} role="alert">
            {validationError}
          </span>
        ) : status ? (
          <span className={save.isError ? goalStyles.statusError : goalStyles.status} role="status">
            {status}
          </span>
        ) : null}
      </div>
    </>
  );
}

/**
 * Capture screen for the monthly cobranza incentive tables (see
 * api/src-ts/reporting/cobranzaIncentivesRepository.ts): the % recuperado tiers for regular agentes
 * de cobranza, with the rate per esquema (CCELL, BCU, BSCU, FCELLS and the managers' columns), and
 * the amount thresholds for agentes de proyecto. Which esquema each agent is paid by is set per
 * month on the Metas page. Editing requires the 'cobranza_goals' grant.
 */
export function CobranzaIncentivesPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const now = new Date();
  const month = Number(searchParams.get('month')) || now.getMonth() + 1;
  const year = Number(searchParams.get('year')) || now.getFullYear();

  const { data, isLoading, isError, error, refetch } = useCobranzaIncentives(month, year);

  function handlePeriodChange(key: 'month' | 'year', value: string) {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next);
  }

  const reportLink = `/reports/cobranza-comisiones?month=${month}&year=${year}`;
  const goalsLink = `/reports/cobranza-comisiones/metas?month=${month}&year=${year}`;
  const hasOwnConfig = Boolean(data && (data.config.tiers.length > 0 || data.config.proyecto_tiers.length > 0));

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Reportes', to: '/' },
        { label: 'Comisiones de Cobranza', to: reportLink },
        { label: 'Metas', to: goalsLink },
        { label: 'Incentivos' },
      ]}
    >
      <div className={styles.heading}>
        <div>
          <h1 className={styles.title}>Incentivos de Cobranza</h1>
          <p className={styles.subtitle}>Tablas de incentivos del mes. El esquema de cada agente se asigna en la página de Metas.</p>
        </div>
      </div>

      <div className={styles.filters}>
        <select className={styles.select} value={month} onChange={(event) => handlePeriodChange('month', event.target.value)} aria-label="Mes">
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>
        <select className={styles.select} value={year} onChange={(event) => handlePeriodChange('year', event.target.value)} aria-label="Año">
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? <LoadingState label="Cargando incentivos..." /> : null}
      {isError ? (
        <ErrorState message={error instanceof Error ? error.message : 'No se pudieron cargar los incentivos.'} onRetry={() => refetch()} />
      ) : null}

      {data && !data.canEdit ? <EmptyState message="No tienes permiso para capturar incentivos de cobranza." /> : null}

      {data?.canEdit ? (
        <IncentivesEditor
          // Re-initialize the drafts only when the period changes - not on every refetch (e.g. window
          // focus), which would silently discard unsaved edits.
          key={`${year}-${month}`}
          month={month}
          year={year}
          initial={hasOwnConfig ? data.config : data.copySource}
          copiedFrom={!hasOwnConfig && data.copySource ? { month: data.copySource.month, year: data.copySource.year } : null}
        />
      ) : null}
    </AppShell>
  );
}
