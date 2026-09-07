import { Link } from 'react-router-dom';
import type { OtrosContratoCommission } from '../../api/types';
import { formatCurrency, formatDate } from '../../utils/format';
import styles from './ContractCommissionCard.module.css';

interface OtrosContratoCommissionCardProps {
  otrosContrato: OtrosContratoCommission;
  nivel: string | null;
  /** The vendedor's tiered rate, resolved once from their TOTAL sales this period (see
   * VendedorCommissionGroup.tier_percentage) - the same rate applies to every one of their
   * sales, this one included. */
  tierPercentage: number | null;
}

/** One "Otros Contratos" sale's commission "receipt" - reuses ContractCommissionCard's styling
 * since the shape (a header + one breakdown line) is the same, just without the
 * services/Placenta/anualidad detail a regular contract has. */
export function OtrosContratoCommissionCard({ otrosContrato, nivel, tierPercentage }: OtrosContratoCommissionCardProps) {
  const currency = otrosContrato.moneda;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <Link to={`/reports/otros-contratos/${otrosContrato.netsuite_id}`} className={styles.contractName}>
            {otrosContrato.name ?? otrosContrato.netsuite_id}
          </Link>
          <p className={styles.meta}>
            Otro contrato · {otrosContrato.servicio_nombre ?? 'Sin servicio'} · Fecha {formatDate(otrosContrato.fecha)}
          </p>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.contractTotal}>{formatCurrency(otrosContrato.tier_commission, currency)}</span>
        </div>
      </div>

      <div className={styles.breakdown}>
        <div className={styles.line}>
          <div className={styles.lineLabel}>
            <span className={styles.tag}>
              Comisión por nivel · Nivel {nivel ?? 'sin asignar'} ({tierPercentage !== null ? `${tierPercentage}%` : 'sin tier'})
            </span>
            <span className={styles.lineDetail}>
              {otrosContrato.servicio_nombre ?? 'Servicio'} {formatCurrency(otrosContrato.monto, currency)}
              {tierPercentage !== null ? ` × ${tierPercentage}%` : ''}
            </span>
          </div>
          <span className={styles.lineAmount}>{formatCurrency(otrosContrato.tier_commission, currency)}</span>
        </div>
      </div>
    </div>
  );
}
