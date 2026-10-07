import type { AsignacionTipo, CobranzaCommissionContractGroup } from '../../api/types';
import { summarizeByAssignee } from '../../utils/cobranzaCommissions';
import { currencyLabel } from '../../config/currencies';
import { formatCurrency } from '../../utils/format';
import styles from './AssigneeSummaryTiles.module.css';

interface AssigneeSummaryTilesProps {
  groups: CobranzaCommissionContractGroup[];
}

const TIPO_LABELS: Record<AsignacionTipo, string> = {
  dueno: 'Dueño',
  cobrador: 'Cobrador',
  bolsa: 'Bolsa',
  paquete_inicial: 'Paquete Inicial',
};

const TIPO_ORDER: Record<AsignacionTipo, number> = {
  bolsa: 0,
  paquete_inicial: 1,
  cobrador: 2,
  dueno: 3,
};

/** One tile per (Dueño, Cobrador) pair, plus one for "Bolsa" and one for "Paquete inicial de
 * anualidades" (always first, distinctly styled - neither is a person), each showing how much got
 * paid under that assignment this period, labeled by role since the same person can hold both
 * roles across different contracts - see
 * api/src-ts/reporting/cobranzaCommissionsRepository.ts for how a contract lands on one bucket or
 * another. */
export function AssigneeSummaryTiles({ groups }: AssigneeSummaryTilesProps) {
  const summaries = summarizeByAssignee(groups).sort((a, b) => {
    const tipoDiff = TIPO_ORDER[a.tipo] - TIPO_ORDER[b.tipo];
    return tipoDiff !== 0 ? tipoDiff : a.name.localeCompare(b.name);
  });

  if (summaries.length === 0) return null;

  return (
    <div className={styles.grid}>
      {summaries.map((summary) => (
        <div
          key={`${summary.tipo}:${summary.name}`}
          className={`${styles.tile} ${summary.tipo === 'bolsa' ? styles.bolsaTile : ''} ${
            summary.tipo === 'paquete_inicial' ? styles.paqueteInicialTile : ''
          }`}
        >
          <p className={styles.name}>{summary.name}</p>
          <p className={styles.meta}>
            {summary.tipo === 'dueno' || summary.tipo === 'cobrador' ? `${TIPO_LABELS[summary.tipo]} · ` : ''}
            {summary.contractsCount} {summary.contractsCount === 1 ? 'contrato' : 'contratos'} · {summary.partidasCount}{' '}
            {summary.partidasCount === 1 ? 'partida' : 'partidas'}
          </p>
          <div className={styles.totals}>
            {summary.totals.map(({ currency, total }) => (
              <div key={currency ?? 'sin-moneda'} className={styles.totalRow}>
                <span className={styles.totalAmount}>{formatCurrency(total, currency)}</span>
                {currency ? <span className={styles.totalCurrency}>{currencyLabel(currency)}</span> : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
