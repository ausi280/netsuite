import { useMemo } from 'react';
import { subsidiaryLabel } from '../../config/subsidiaries';
import { BOLSA_MIN_PCT, IMPORTE_PAGADO_CURRENCY, type BolsaSplit, type YearMonth } from '../../utils/cobranzaCommissions';
import { formatCurrency } from '../../utils/format';
import chartStyles from '../charts/charts.module.css';
import styles from './CobranzaGoalsSection.module.css';

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

interface BolsaSectionProps {
  month: number;
  year: number;
  /** The subsidiaria whose Bolsa this card splits. */
  subsidiaria: string;
  /** splitBolsa over everyone with a goal this month in this subsidiaria. */
  split: BolsaSplit;
  /** Who the caller may see rows for (a self cobrador/dueño only sees people in their report). */
  visibleIds: Set<string>;
}

function monthLabel(m: YearMonth, withYear: boolean): string {
  return withYear ? `${MONTH_NAMES[m.month - 1]} ${m.year}` : MONTH_NAMES[m.month - 1];
}

const formatPct = (value: number) => `${value.toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`;

/**
 * One subsidiaria's "Bolsa" split (see splitBolsa): only its people who reached BOLSA_MIN_PCT of
 * their goal take part, and it's divided in proportion to the overdue accounts each recovered THIS
 * month in that subsidiaria - contracts credited to them in this report with a paid partida that was
 * due 4, 5 or 6 months back (report month = 1). Each step is spelled out on the card and every input
 * is a column, so anyone can redo the math for their own row.
 */
export function BolsaSection({ month, year, subsidiaria, split, visibleIds }: BolsaSectionProps) {
  const { bolsa, bolsaContracts, dueMonths, totalAccounts, qualifiedCount } = split;
  const rows = useMemo(() => split.rows.filter((r) => visibleIds.has(r.employee_id)), [split, visibleIds]);
  const peopleCount = split.rows.length;

  const spansYears = dueMonths.some((m) => m.year !== year);
  const monthsText = dueMonths.map((m) => monthLabel(m, spansYears)).join(', ').replace(/, ([^,]*)$/, ' o $1');
  const currentMonth = monthLabel({ month, year }, false);
  const subName = subsidiaryLabel(subsidiaria);

  const header = (
    <div className={styles.header}>
      <div>
        <h2 className={styles.title}>Reparto de Bolsa · {subName}</h2>
        <p className={styles.subtitle}>
          Cómo se calcula lo que recibe cada persona de la Bolsa de {subName} de {currentMonth}. Solo participan personas de esta subsidiaria.
        </p>
      </div>
    </div>
  );

  if (peopleCount === 0) {
    if (bolsa <= 0) return null;
    return (
      <section className={`${chartStyles.chartCard} ${styles.section}`}>
        {header}
        <p className={chartStyles.emptyState}>
          Bolsa de {formatCurrency(bolsa, IMPORTE_PAGADO_CURRENCY)} ({bolsaContracts} contratos): nadie de esta subsidiaria tiene meta este mes, así que
          no se reparte.
        </p>
      </section>
    );
  }

  return (
    <section className={`${chartStyles.chartCard} ${styles.section}`}>
      {header}

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span className={styles.kpiValue}>{formatCurrency(bolsa, IMPORTE_PAGADO_CURRENCY)}</span>
          <span className={styles.kpiLabel}>Bolsa ({bolsaContracts} contratos, neto de IVA)</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiValue}>
            {qualifiedCount} / {peopleCount}
          </span>
          <span className={styles.kpiLabel}>llegaron al {BOLSA_MIN_PCT}% de su meta</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiValue}>{totalAccounts}</span>
          <span className={styles.kpiLabel}>cuentas recuperadas entre quienes califican</span>
        </div>
      </div>

      <ol className={styles.steps}>
        <li>
          <strong>Quién participa:</strong> solo quien llegó al <strong>{BOLSA_MIN_PCT}% o más</strong> de su meta del mes. El avance es el
          mismo de “Metas del mes” (lo cobrado por la persona + su parte de la Bolsa Domiciliado de {subName}).
        </li>
        <li>
          <strong>Cuentas recuperadas:</strong> contratos de {subName} que la persona cobró en <strong>{currentMonth}</strong> (como Dueño o Cobrador) y que ya
          estaban vencidos: al menos una de las partidas pagadas tenía fecha límite de pago en <strong>{monthsText}</strong> (los meses 4, 5 y 6
          hacia atrás, contando {currentMonth} como el mes 1). Cada contrato cuenta una sola vez, en el mes más antiguo que debía.
        </li>
        <li>
          <strong>Porcentaje:</strong> cuentas recuperadas de la persona ÷ total de cuentas recuperadas de todos los que califican ({totalAccounts}).
        </li>
        <li>
          <strong>Monto:</strong> porcentaje × Bolsa ({formatCurrency(bolsa, IMPORTE_PAGADO_CURRENCY)}).
        </li>
      </ol>

      {qualifiedCount === 0 ? (
        <p className={chartStyles.emptyState}>Nadie llegó al {BOLSA_MIN_PCT}% de su meta este mes, así que la Bolsa no se reparte.</p>
      ) : null}
      {qualifiedCount > 0 && totalAccounts === 0 ? (
        <p className={chartStyles.emptyState}>
          Quienes califican no recuperaron cuentas vencidas de {monthsText} en {currentMonth}, así que no hay base para repartir la Bolsa.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className={styles.tableWrapper}>
          <table className={chartStyles.table}>
            <thead>
              <tr>
                <th>Persona</th>
                <th>Avance meta</th>
                <th>¿Califica?</th>
                {dueMonths.map((m) => (
                  <th key={`${m.year}-${m.month}`}>Vencidas de {monthLabel(m, spansYears)}</th>
                ))}
                <th>Total cuentas</th>
                <th>% del reparto</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.employee_id}>
                  <td>{row.nombre}</td>
                  <td>{row.pct === null ? '—' : `${Math.round(row.pct)}%`}</td>
                  <td>
                    {row.qualifies ? (
                      'Sí'
                    ) : (
                      <span className={styles.status}>No (le faltó {Math.max(1, Math.ceil(BOLSA_MIN_PCT - (row.pct ?? 0)))} pts)</span>
                    )}
                  </td>
                  {row.perMonth.map((n, index) => (
                    <td key={index}>{n}</td>
                  ))}
                  <td>{row.accounts}</td>
                  <td>{row.share === null ? '—' : `${row.accounts} ÷ ${totalAccounts} = ${formatPct(row.share * 100)}`}</td>
                  <td>{row.amount === null ? '—' : formatCurrency(row.amount, IMPORTE_PAGADO_CURRENCY)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
