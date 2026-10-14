import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CobranzaGoalPerson } from '../api/types';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import {
  useCobranzaGoals,
  useSetCobranzaGoalDefault,
  useSetCobranzaGoalExclusion,
  useSetCobranzaGoalOverride,
} from '../hooks/useCobranzaGoals';
import chartStyles from '../components/charts/charts.module.css';
import styles from './CommissionsPage.module.css';
import goalStyles from '../components/reports/CobranzaGoalsSection.module.css';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const CURRENT_YEAR = new Date().getFullYear();
// Includes next year too - goals are typically captured ahead of the month they apply to.
const YEAR_OPTIONS = Array.from({ length: 7 }, (_, index) => CURRENT_YEAR + 1 - index);

function parseAmount(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function amountToInput(amount: number | null): string {
  return amount === null || amount === 0 ? '' : String(amount);
}

/** One person's goal for the month - saves on blur/Enter. Typing the month's general value makes
 * them follow the general goal again; clearing the box saves "sin meta" (an explicit 0 override),
 * so they're left out of the progress charts for that month. Shows its own save status, since a
 * save-on-blur field otherwise gives no visible confirmation. */
function GoalInput({ person, month, year, defaultAmount }: { person: CobranzaGoalPerson; month: number; year: number; defaultAmount: number | null }) {
  const [value, setValue] = useState(amountToInput(person.goal_amount));
  // Re-sync the box when the stored goal changes (after a save, or "Aplicar a todos") - derived
  // during render rather than in an effect, per React's "adjusting state when a prop changes".
  const [syncedGoal, setSyncedGoal] = useState(person.goal_amount);
  if (person.goal_amount !== syncedGoal) {
    setSyncedGoal(person.goal_amount);
    setValue(amountToInput(person.goal_amount));
  }
  const save = useSetCobranzaGoalOverride();

  function persist(amount: number | null) {
    save.mutate({ employeeId: person.employee_id, input: { month, year, amount } });
  }

  function commit() {
    const parsed = parseAmount(value);
    if (parsed === undefined) return;
    // Cleared = "sin meta" this month (0); the general value = follow the general goal (no override).
    const amount = parsed === null || parsed === 0 ? 0 : parsed === defaultAmount ? null : parsed;
    if (amount === person.override_amount) return;
    persist(amount);
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
    <div className={goalStyles.goalCell}>
      <input
        className={`${goalStyles.input} ${person.override_amount !== null ? goalStyles.inputOverride : ''}`}
        type="number"
        min="0"
        step="any"
        value={value}
        placeholder="Sin meta"
        disabled={save.isPending}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        aria-label={`Meta de ${person.nombre}`}
      />
      {person.override_amount !== null && defaultAmount !== null ? (
        <button type="button" className={goalStyles.linkButton} onClick={() => persist(null)} disabled={save.isPending}>
          Usar meta general
        </button>
      ) : null}
      {status ? (
        <span className={save.isError ? goalStyles.statusError : goalStyles.status} role="status">
          {status}
        </span>
      ) : null}
    </div>
  );
}

/** "Meta general" - saves the month's default AND clears every individual override, i.e. sets
 * everyone to this one value; individual goals are then adjusted per row. Keyed by the parent on
 * the stored default, so the input resets whenever that changes. */
function DefaultGoalForm({ month, year, defaultAmount, overrideCount }: { month: number; year: number; defaultAmount: number | null; overrideCount: number }) {
  const [value, setValue] = useState(defaultAmount === null ? '' : String(defaultAmount));
  const setDefault = useSetCobranzaGoalDefault();
  const parsed = parseAmount(value);

  function handleApplyToAll() {
    if (parsed === undefined) return;
    if (
      overrideCount > 0 &&
      !window.confirm(`Esto reemplazará las ${overrideCount} metas individuales (o \"sin meta\") de este mes por el valor general. ¿Continuar?`)
    ) {
      return;
    }
    setDefault.mutate({ month, year, amount: parsed, clear_overrides: true });
  }

  return (
    <div className={goalStyles.defaultForm}>
      <label className={goalStyles.defaultLabel} htmlFor="cobranza-goal-default">
        Meta general
      </label>
      <input
        id="cobranza-goal-default"
        className={goalStyles.input}
        type="number"
        min="0"
        step="any"
        placeholder="Monto"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="button" className={goalStyles.primaryButton} onClick={handleApplyToAll} disabled={setDefault.isPending || parsed === undefined}>
        {setDefault.isPending ? 'Aplicando...' : 'Aplicar a todos'}
      </button>
    </div>
  );
}

/** Removes (or restores) a person from the goals list for every month - for placeholder/shared
 * employees ("COBRADOR 1", "OFICINA"...) who show up as Dueño/Cobrador but shouldn't have a goal. */
function ExclusionButton({ employeeId, nombre, excluded }: { employeeId: string; nombre: string; excluded: boolean }) {
  const toggle = useSetCobranzaGoalExclusion();

  function handleClick() {
    if (!excluded && !window.confirm(`¿Quitar a ${nombre} de las metas? Dejará de tener meta y de aparecer en las gráficas, en todos los meses.`)) {
      return;
    }
    toggle.mutate({ employeeId, excluded: !excluded });
  }

  return (
    <button type="button" className={goalStyles.linkButton} onClick={handleClick} disabled={toggle.isPending}>
      {toggle.isPending ? 'Guardando...' : excluded ? 'Restaurar' : 'Quitar'}
    </button>
  );
}

/**
 * Capture screen for the monthly collections goals (metas) per Dueño/Cobrador - a month-wide
 * default applied to everyone plus individual overrides (see
 * api/src-ts/reporting/cobranzaGoalsRepository.ts). Editing requires the 'cobranza_goals' grant;
 * the progress against these goals is shown read-only on the Comisiones de Cobranza report
 * (CobranzaGoalsSection). Shares the report's ?month=&year= params, so the link between the two
 * pages keeps the selected period.
 */
export function CobranzaGoalsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');

  const now = new Date();
  const month = Number(searchParams.get('month')) || now.getMonth() + 1;
  const year = Number(searchParams.get('year')) || now.getFullYear();

  const { data, isLoading, isError, error, refetch } = useCobranzaGoals(month, year);
  const goals = data?.goals;

  const people = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = goals?.people ?? [];
    return term ? all.filter((p) => p.nombre.toLowerCase().includes(term)) : all;
  }, [goals, search]);

  const overrideCount = goals?.people.filter((p) => p.override_amount !== null).length ?? 0;

  function handlePeriodChange(key: 'month' | 'year', value: string) {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next);
  }

  const reportLink = `/reports/cobranza-comisiones?month=${month}&year=${year}`;

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Reportes', to: '/' },
        { label: 'Comisiones de Cobranza', to: reportLink },
        { label: 'Metas' },
      ]}
    >
      <div className={styles.heading}>
        <div>
          <h1 className={styles.title}>Metas de Cobranza</h1>
          <p className={styles.subtitle}>
            Meta mensual de cobranza (neto de IVA, MXN) por Dueño / Cobrador. Aplica una meta general a todos y ajusta solo a quien sea
            distinto.
          </p>
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
        <input
          type="search"
          className={styles.select}
          placeholder="Buscar persona"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Buscar persona"
        />
      </div>

      {isLoading ? <LoadingState label="Cargando metas..." /> : null}
      {isError ? (
        <ErrorState message={error instanceof Error ? error.message : 'No se pudieron cargar las metas de cobranza.'} onRetry={() => refetch()} />
      ) : null}

      {goals && data && !data.canEdit ? <EmptyState message="No tienes permiso para capturar metas de cobranza." /> : null}

      {goals && data?.canEdit ? (
        <section className={`${chartStyles.chartCard} ${goalStyles.section}`}>
          <div className={goalStyles.header}>
            <div>
              <h2 className={goalStyles.title}>
                {MONTH_NAMES[month - 1]} {year}
              </h2>
              <p className={goalStyles.subtitle}>
                {goals.people.length} personas · {overrideCount} con meta individual o sin meta
              </p>
            </div>
            <DefaultGoalForm
              key={`${year}-${month}-${goals.default_amount}`}
              month={month}
              year={year}
              defaultAmount={goals.default_amount}
              overrideCount={overrideCount}
            />
          </div>

          {people.length > 0 ? (
            <div className={goalStyles.tableWrapper}>
              <table className={chartStyles.table}>
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Meta</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {people.map((person) => (
                    <tr key={person.employee_id}>
                      <td>
                        {person.nombre}
                        {person.override_amount === 0 ? (
                          <span className={goalStyles.overrideBadge}>sin meta</span>
                        ) : person.override_amount !== null ? (
                          <span className={goalStyles.overrideBadge}>individual</span>
                        ) : null}
                      </td>
                      <td>
                        <GoalInput
                          key={`${year}-${month}`}
                          person={person}
                          month={month}
                          year={year}
                          defaultAmount={goals.default_amount}
                        />
                      </td>
                      <td>
                        <ExclusionButton employeeId={person.employee_id} nombre={person.nombre} excluded={false} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={chartStyles.emptyState}>Ninguna persona coincide con la búsqueda.</p>
          )}

          {goals.excluded.length > 0 ? (
            <div>
              <h3 className={goalStyles.title}>Excluidos de metas ({goals.excluded.length})</h3>
              <p className={goalStyles.subtitle}>No reciben meta ni aparecen en las gráficas, en ningún mes.</p>
              <table className={chartStyles.table}>
                <tbody>
                  {goals.excluded.map((person) => (
                    <tr key={person.employee_id}>
                      <td>{person.nombre}</td>
                      <td>
                        <ExclusionButton employeeId={person.employee_id} nombre={person.nombre} excluded />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
    </AppShell>
  );
}
