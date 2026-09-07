import { useState } from 'react';
import type { VendedorCommissionGroup } from '../../api/types';
import { sumCommissionByCurrency } from '../../utils/commissions';
import { formatCurrency } from '../../utils/format';
import { ContractCommissionCard } from './ContractCommissionCard';
import styles from './VendedorGroupCard.module.css';

interface VendedorGroupCardProps {
  group: VendedorCommissionGroup;
  defaultExpanded?: boolean;
}

export function VendedorGroupCard({ group, defaultExpanded = true }: VendedorGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const totalsByCurrency = sumCommissionByCurrency(group.contracts);

  return (
    <div className={styles.card}>
      <button type="button" className={styles.header} onClick={() => setIsExpanded((prev) => !prev)} aria-expanded={isExpanded}>
        <svg
          className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <div className={styles.identity}>
          <span className={styles.name}>{group.vendedor_nombre ?? group.vendedor_id}</span>
          <span className={styles.nivelBadge}>Nivel {group.nivel ?? 'sin asignar'}</span>
        </div>
        <span className={styles.contractsCount}>
          {group.contracts_count} contrato{group.contracts_count === 1 ? '' : 's'}
        </span>
        <div className={styles.totals}>
          {totalsByCurrency.map(({ currency, total }) => (
            <span key={currency ?? 'sin-moneda'} className={styles.totalAmount}>
              {formatCurrency(total, currency)}
            </span>
          ))}
        </div>
      </button>
      {isExpanded ? (
        <div className={styles.contracts}>
          <p className={styles.tierExplainer}>
            Nivel {group.nivel ?? 'sin asignar'} se calcula sobre el total de ventas de este vendedor en el periodo, en
            todas sus subsidiarias: {formatCurrency(group.total_servicios_periodo, null)} →{' '}
            {group.tier_percentage !== null ? `${group.tier_percentage}% de comisión` : 'sin tier configurado'}. Esa misma
            tasa se aplica a cada contrato de abajo.
          </p>
          {group.contracts.map((contract) => (
            <ContractCommissionCard key={contract.netsuite_id} contract={contract} nivel={group.nivel} tierPercentage={group.tier_percentage} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
