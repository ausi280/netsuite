import { Link } from 'react-router-dom';
import type { ContractCommission } from '../../api/types';
import { contractStatusLabel, partidaStatusLabel, serviceTypeLabel } from '../../config/labels';
import { subsidiaryLabel } from '../../config/subsidiaries';
import { formatDate } from '../../utils/format';
import { formatCommissionAmount } from '../../utils/commissions';
import styles from './ContractCommissionCard.module.css';

interface ContractCommissionCardProps {
  contract: ContractCommission;
  nivel: string | null;
  /** The vendedor's tiered rate, resolved once from their TOTAL sales this period (see
   * VendedorCommissionGroup.tier_percentage) - the same rate applies to every one of their
   * contracts, this one included. */
  tierPercentage: number | null;
}

/** One contract's commission "receipt" - every number traced back to where it came from, per the
 * "easy to understand why the calculation goes like that" ask. */
export function ContractCommissionCard({ contract, nivel, tierPercentage }: ContractCommissionCardProps) {
  const currency = contract.moneda;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <Link to={`/reports/contracts/${contract.netsuite_id}`} className={styles.contractName}>
            {contract.name ?? contract.netsuite_id}
          </Link>
          <p className={styles.meta}>
            {contract.titular_nombre ?? 'Sin titular'} · Inicio {formatDate(contract.fecha_inicio)}
            {contract.subsidiaria_id ? ` · ${subsidiaryLabel(contract.subsidiaria_id)}` : ''}
            {contract.folio_sistema_anterior ? ` · Sistema anterior: ${contract.folio_sistema_anterior}` : ''}
          </p>
        </div>
        <div className={styles.headerRight}>
          {contract.docs_completos ? (
            <span className={styles.docsCompleteBadge} title="El sistema anterior marca los documentos como completos - este contrato cuenta para comisión">
              Docs completos
            </span>
          ) : (
            <span className={styles.docsPendingBadge} title="No cuenta para comisión hasta que el sistema anterior marque los documentos como completos">
              Docs pendientes
            </span>
          )}
          <span className={styles.statusBadge}>{contractStatusLabel(contract.estatus)}</span>
          <span className={styles.contractTotal}>{formatCommissionAmount(contract.total_commission, currency)}</span>
        </div>
      </div>

      <div className={styles.breakdown}>
        {contract.services.length > 0 ? (
          <div className={styles.line}>
            <div className={styles.lineLabel}>
              <span className={styles.tag}>
                Comisión por nivel · Nivel {nivel ?? 'sin asignar'} ({tierPercentage !== null ? `${tierPercentage}%` : 'sin tier'})
              </span>
              <span className={styles.lineDetail}>
                {contract.services.map((s) => `${serviceTypeLabel(s.tipo)} ${formatCommissionAmount(s.precio_procesamiento, currency)}`).join(' + ')}
                {' = '}
                {formatCommissionAmount(contract.total_servicios, currency)}
                {tierPercentage !== null ? ` × ${tierPercentage}%` : ''}
              </span>
            </div>
            <span className={styles.lineAmount}>{formatCommissionAmount(contract.tier_commission, currency)}</span>
          </div>
        ) : null}

        {contract.has_bonus_service ? (
          <div className={styles.line}>
            <div className={styles.lineLabel}>
              <span className={styles.tag}>
                Bono {contract.services.filter((s) => s.is_bonus_service).map((s) => serviceTypeLabel(s.tipo)).join(' + ')} · 3% fijo
              </span>
              <span className={styles.lineDetail}>
                {formatCommissionAmount(contract.total_servicios, currency)} (total de servicios) × 3%
              </span>
            </div>
            <span className={styles.lineAmount}>{formatCommissionAmount(contract.placenta_adn_bonus, currency)}</span>
          </div>
        ) : null}

        {contract.anualidades.length > 0 ? (
          <div className={styles.line}>
            <div className={styles.lineLabel}>
              <span className={styles.tag}>Bono de anualidades · $100 c/u</span>
              <span className={styles.lineDetail}>
                {contract.anualidades.length} × $100 = {formatCommissionAmount(contract.anualidad_bonus_total, currency)} · Años:{' '}
                {contract.anualidades.map((a) => a.anio).join(', ')}
              </span>
            </div>
            <span className={styles.lineAmount}>{formatCommissionAmount(contract.anualidad_bonus_total, currency)}</span>
          </div>
        ) : null}

        {contract.services.length === 0 && contract.anualidades.length === 0 ? (
          contract.non_paid_service_statuses.length > 0 ? (
            <p className={styles.empty}>
              Este contrato tiene servicio(s) con estatus de pago {contract.non_paid_service_statuses.map((code) => partidaStatusLabel(code)).join(' / ')} -
              no cuentan para comisión hasta que se marquen como Pagado.
            </p>
          ) : (
            <p className={styles.empty}>Este contrato no tiene servicios activos ni anualidades que generen comisión.</p>
          )
        ) : null}
      </div>
    </div>
  );
}
