import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { CobranzaCommissionContractGroup, CobranzaGoalPerson } from '../../api/types';
import { useCobranzaGoals } from '../../hooks/useCobranzaGoals';
import { collectedByEmployee, IMPORTE_PAGADO_CURRENCY } from '../../utils/cobranzaCommissions';
import { formatCurrency } from '../../utils/format';
import { CobranzaGoalProgressChart, type CobranzaGoalProgressRow } from '../charts/CobranzaGoalProgressChart';
import chartStyles from '../charts/charts.module.css';
import styles from './CobranzaGoalsSection.module.css';

interface CobranzaGoalsSectionProps {
  month: number;
  year: number;
  /** The report's own (subsidiary-filtered) data - progress is measured against exactly what the
   * page shows. */
  groups: CobranzaCommissionContractGroup[];
}

interface PersonProgress extends CobranzaGoalPerson {
  collected: number;
  pct: number | null;
}

/**
 * Monthly collections goal (meta) per Dueño/Cobrador and each one's % of progress - collected
 * (net of IVA, MXN, same figure the assignee tiles accumulate) over their goal. Goals are a
 * month-wide default applied to everyone plus individual overrides - see
 * api/src-ts/reporting/cobranzaGoalsRepository.ts. Read-only here - goals are captured on their own
 * page (CobranzaGoalsPage, linked from this card for callers with the 'cobranza_goals' grant). A
 * self cobrador/dueño sees the progress of the people present in the report.
 */
export function CobranzaGoalsSection({ month, year, groups }: CobranzaGoalsSectionProps) {
  const { data, isLoading, isError } = useCobranzaGoals(month, year);

  const goals = data?.goals;
  const canEdit = Boolean(data?.canEdit);
  const canViewAll = Boolean(data?.canViewAll);

  const people = useMemo((): PersonProgress[] => {
    if (!goals) return [];
    const collected = collectedByEmployee(groups);

    // Only people with a goal value are charted/listed - anyone excluded from goals (see
    // cobranza_goal_exclusions) or otherwise without one simply isn't part of this card. A self
    // cobrador/dueño additionally only sees the people present in their (subsidiary-capped) report.
    const visible = goals.people.filter(
      (p): p is CobranzaGoalPerson & { goal_amount: number } =>
        p.goal_amount !== null && p.goal_amount > 0 && (canViewAll || collected.has(p.employee_id)),
    );

    return visible
      .map((person) => {
        const amount = collected.get(person.employee_id) ?? 0;
        const pct = person.goal_amount ? (amount / person.goal_amount) * 100 : null;
        return { ...person, collected: amount, pct };
      })
      .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.nombre.localeCompare(b.nombre));
  }, [goals, groups, canViewAll]);

  const chartRows = useMemo(
    (): CobranzaGoalProgressRow[] =>
      people
        .filter((p): p is PersonProgress & { pct: number; goal_amount: number } => p.pct !== null && p.goal_amount !== null)
        .map((p) => ({ employee_id: p.employee_id, nombre: p.nombre, collected: p.collected, goal: p.goal_amount, pct: p.pct })),
    [people],
  );

  const totals = useMemo(() => {
    const withGoal = people.filter((p) => p.goal_amount !== null);
    const goal = withGoal.reduce((sum, p) => sum + (p.goal_amount ?? 0), 0);
    const collected = withGoal.reduce((sum, p) => sum + p.collected, 0);
    const reached = withGoal.filter((p) => (p.pct ?? 0) >= 100).length;
    return { goal, collected, pct: goal > 0 ? (collected / goal) * 100 : null, reached, withGoal: withGoal.length };
  }, [people]);

  if (isLoading) return null;
  if (isError || !goals) return <p className={styles.error}>No se pudieron cargar las metas de cobranza.</p>;

  return (
    <section className={`${chartStyles.chartCard} ${styles.section}`}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Metas del mes</h2>
          <p className={styles.subtitle}>Cobrado (neto de IVA, MXN) contra la meta de cada Dueño / Cobrador.</p>
        </div>
        {canEdit ? (
          <Link to={`/reports/cobranza-comisiones/metas?month=${month}&year=${year}`} className={styles.configLink}>
            Configurar metas
          </Link>
        ) : null}
      </div>

      {totals.withGoal > 0 ? (
        <div className={styles.kpis}>
          <div className={styles.kpi}>
            <span className={styles.kpiValue}>{totals.pct === null ? '—' : `${Math.round(totals.pct)}%`}</span>
            <span className={styles.kpiLabel}>avance total</span>
          </div>
          <div className={styles.kpi}>
            <span className={styles.kpiValue}>{formatCurrency(totals.collected, IMPORTE_PAGADO_CURRENCY)}</span>
            <span className={styles.kpiLabel}>de {formatCurrency(totals.goal, IMPORTE_PAGADO_CURRENCY)}</span>
          </div>
          <div className={styles.kpi}>
            <span className={styles.kpiValue}>
              {totals.reached} / {totals.withGoal}
            </span>
            <span className={styles.kpiLabel}>alcanzaron su meta</span>
          </div>
        </div>
      ) : null}

      {chartRows.length > 0 ? (
        <CobranzaGoalProgressChart rows={chartRows} />
      ) : (
        <p className={chartStyles.emptyState}>
          {canEdit ? 'Usa "Configurar metas" para definir la meta del mes y ver el avance de cada persona.' : 'Aún no hay metas definidas para este mes.'}
        </p>
      )}

      {people.length > 0 ? (
        <div className={styles.tableWrapper}>
          <table className={chartStyles.table}>
            <thead>
              <tr>
                <th>Persona</th>
                <th>Meta</th>
                <th>Cobrado</th>
                <th>Avance</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.employee_id}>
                  <td>
                    {person.nombre}
                    {person.override_amount !== null ? <span className={styles.overrideBadge}>individual</span> : null}
                  </td>
                  <td>{formatCurrency(person.goal_amount, IMPORTE_PAGADO_CURRENCY)}</td>
                  <td>{formatCurrency(person.collected, IMPORTE_PAGADO_CURRENCY)}</td>
                  <td>
                    {person.pct === null ? (
                      '—'
                    ) : (
                      <div className={styles.progressCell}>
                        <div className={styles.progressTrack} aria-hidden="true">
                          <div className={styles.progressFill} style={{ width: `${Math.min(100, person.pct)}%` }} />
                        </div>
                        <span className={styles.progressValue}>{Math.round(person.pct)}%</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
