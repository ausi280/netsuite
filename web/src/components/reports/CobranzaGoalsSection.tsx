import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { CobranzaCommissionContractGroup, CobranzaGoalPerson } from '../../api/types';
import { useCobranzaGoals } from '../../hooks/useCobranzaGoals';
import { subsidiaryLabel } from '../../config/subsidiaries';
import {
  bolsaCollected,
  bolsaSubsidiarias,
  collectedByEmployee,
  homeSubsidiaryByEmployee,
  IMPORTE_PAGADO_CURRENCY,
  splitBolsa,
} from '../../utils/cobranzaCommissions';
import { formatCurrency } from '../../utils/format';
import { CobranzaGoalProgressChart, type CobranzaGoalProgressRow } from '../charts/CobranzaGoalProgressChart';
import chartStyles from '../charts/charts.module.css';
import { BolsaSection } from './BolsaSection';
import styles from './CobranzaGoalsSection.module.css';

interface CobranzaGoalsSectionProps {
  month: number;
  year: number;
  /** The report's own (subsidiary-filtered) data - progress is measured against exactly what the
   * page shows. */
  groups: CobranzaCommissionContractGroup[];
}

interface PersonProgress extends CobranzaGoalPerson {
  /** What the person collected themselves. */
  collected: number;
  /** The subsidiaria they work in (see homeSubsidiaryByEmployee) - null when they collected nothing
   * this month. */
  subsidiaria: string | null;
  /** Their equal share of their subsidiaria's Bolsa Domiciliado pool. */
  bolsa: number;
  /** (collected + bolsa) / goal × 100. */
  pct: number | null;
  /** What they get from their subsidiaria's Bolsa split (see BolsaSection) - null when they don't
   * take part. Paid on top; never counts toward `pct`, which decides who takes part. */
  reparto: number | null;
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

  const { people, domiciliadoPools, bolsaSplits } = useMemo(() => {
    if (!goals) return { people: [], domiciliadoPools: [], bolsaSplits: [] };
    const collected = collectedByEmployee(groups);
    const home = homeSubsidiaryByEmployee(groups);

    // Only people with a goal value are charted/listed - anyone excluded from goals (see
    // cobranza_goal_exclusions) or otherwise without one simply isn't part of this card.
    const withGoal = goals.people.filter((p): p is CobranzaGoalPerson & { goal_amount: number } => p.goal_amount !== null && p.goal_amount > 0);
    // Each subsidiaria's Bolsa Domiciliado is split equally between its own people with a goal and
    // counts toward each one's goal. Divided by the full goal list (not just who's visible) so a
    // self cobrador/dueño sees the same share everyone else does.
    const subs = Array.from(new Set([...bolsaSubsidiarias(groups), ...withGoal.map((p) => home.get(p.employee_id)).filter((s): s is string => !!s)])).sort();
    const pools = subs.map((sub) => {
      const members = withGoal.filter((p) => home.get(p.employee_id) === sub).length;
      const total = bolsaCollected(groups, 'bolsa_domiciliado', sub);
      return { subsidiaria: sub, total, members, share: members > 0 ? total / members : 0 };
    });
    const shareBySub = new Map(pools.map((p) => [p.subsidiaria, p.share]));

    const base = withGoal.map((person) => {
      const amount = collected.get(person.employee_id) ?? 0;
      const subsidiaria = home.get(person.employee_id) ?? null;
      const bolsa = subsidiaria ? (shareBySub.get(subsidiaria) ?? 0) : 0;
      const pct = person.goal_amount ? ((amount + bolsa) / person.goal_amount) * 100 : null;
      return { ...person, collected: amount, subsidiaria, bolsa, pct };
    });

    // Each subsidiaria's Bolsa split, over its people's goal progress above.
    const splits = subs.map((sub) => ({
      subsidiaria: sub,
      split: splitBolsa(
        groups,
        sub,
        base.filter((p) => p.subsidiaria === sub),
        month,
        year,
      ),
    }));
    const repartoById = new Map(splits.flatMap(({ split }) => split.rows.map((r) => [r.employee_id, r.amount] as const)));

    const all: PersonProgress[] = base
      .map((person) => ({ ...person, reparto: repartoById.get(person.employee_id) ?? null }))
      .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.nombre.localeCompare(b.nombre));
    // A self cobrador/dueño only sees the people present in their (subsidiary-capped) report.
    const visible = all.filter((p) => canViewAll || collected.has(p.employee_id));
    return { people: visible, domiciliadoPools: pools.filter((p) => p.total > 0), bolsaSplits: splits };
  }, [goals, groups, canViewAll, month, year]);

  const hasReparto = people.some((p) => p.reparto !== null);

  const chartRows = useMemo(
    (): CobranzaGoalProgressRow[] =>
      people
        .filter((p): p is PersonProgress & { pct: number; goal_amount: number } => p.pct !== null && p.goal_amount !== null)
        .map((p) => ({
          employee_id: p.employee_id,
          nombre: p.nombre,
          collected: p.collected,
          bolsa: p.bolsa,
          goal: p.goal_amount,
          ownPct: (p.collected / p.goal_amount) * 100,
          bolsaPct: (p.bolsa / p.goal_amount) * 100,
          reparto: p.reparto ?? 0,
          repartoPct: ((p.reparto ?? 0) / p.goal_amount) * 100,
          pct: p.pct,
        })),
    [people],
  );

  const visibleIds = useMemo(() => new Set(people.map((p) => p.employee_id)), [people]);

  const totals = useMemo(() => {
    const withGoal = people.filter((p) => p.goal_amount !== null);
    const goal = withGoal.reduce((sum, p) => sum + (p.goal_amount ?? 0), 0);
    const collected = withGoal.reduce((sum, p) => sum + p.collected + p.bolsa, 0);
    const reached = withGoal.filter((p) => (p.pct ?? 0) >= 100).length;
    return { goal, collected, pct: goal > 0 ? (collected / goal) * 100 : null, reached, withGoal: withGoal.length };
  }, [people]);

  if (isLoading) return null;
  if (isError || !goals) return <p className={styles.error}>No se pudieron cargar las metas de cobranza.</p>;

  return (
    <>
      <section className={`${chartStyles.chartCard} ${styles.section}`}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Metas del mes</h2>
            <p className={styles.subtitle}>
              Cobrado (neto de IVA, MXN) contra la meta de cada Dueño / Cobrador. Incluye la Bolsa Domiciliado de su subsidiaria, repartida en
              partes iguales entre quienes tienen meta en ella (la subsidiaria de cada persona es donde cobró más este mes).
            </p>
            {domiciliadoPools.length > 0 ? (
              <ul className={styles.subtitle}>
                {domiciliadoPools.map((pool) => (
                  <li key={pool.subsidiaria}>
                    {subsidiaryLabel(pool.subsidiaria)}: {formatCurrency(pool.total, IMPORTE_PAGADO_CURRENCY)}
                    {pool.members > 0
                      ? ` ÷ ${pool.members} ${pool.members === 1 ? 'persona' : 'personas'} = ${formatCurrency(pool.share, IMPORTE_PAGADO_CURRENCY)} c/u`
                      : ' - nadie de esta subsidiaria tiene meta, no se reparte'}
                  </li>
                ))}
              </ul>
            ) : null}
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
                  <th>Subsidiaria</th>
                  <th>Meta</th>
                  <th>Cobrado propio</th>
                  <th>Parte de la Bolsa Domiciliado</th>
                  <th>Total</th>
                  <th>Avance</th>
                  {hasReparto ? <th>Reparto de Bolsa</th> : null}
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person.employee_id}>
                    <td>
                      {person.nombre}
                      {person.override_amount !== null ? <span className={styles.overrideBadge}>Proyecto</span> : null}
                    </td>
                    <td>{person.subsidiaria ? subsidiaryLabel(person.subsidiaria) : '—'}</td>
                    <td>{formatCurrency(person.goal_amount, IMPORTE_PAGADO_CURRENCY)}</td>
                    <td>{formatCurrency(person.collected, IMPORTE_PAGADO_CURRENCY)}</td>
                    <td>{formatCurrency(person.bolsa, IMPORTE_PAGADO_CURRENCY)}</td>
                    <td>{formatCurrency(person.collected + person.bolsa, IMPORTE_PAGADO_CURRENCY)}</td>
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
                    {hasReparto ? <td>{person.reparto === null ? '—' : formatCurrency(person.reparto, IMPORTE_PAGADO_CURRENCY)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      {bolsaSplits.map(({ subsidiaria, split }) => (
        <BolsaSection key={subsidiaria} month={month} year={year} subsidiaria={subsidiaria} split={split} visibleIds={visibleIds} />
      ))}
    </>
  );
}
