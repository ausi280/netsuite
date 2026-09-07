import { useState } from 'react';
import type { VendedorCommissionGroup } from '../../api/types';
import { sumContractsByCurrency, sumOtrosContratosByCurrency } from '../../utils/commissions';
import { formatCurrency } from '../../utils/format';
import { ContractCommissionCard } from './ContractCommissionCard';
import { OtrosContratoCommissionCard } from './OtrosContratoCommissionCard';
import styles from './VendedorGroupCard.module.css';

interface VendedorGroupCardProps {
  group: VendedorCommissionGroup;
  defaultExpanded?: boolean;
}

export function VendedorGroupCard({ group, defaultExpanded = true }: VendedorGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const contractsTotals = sumContractsByCurrency([group]);
  const otrosContratosTotals = sumOtrosContratosByCurrency([group]);

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
        <div className={styles.totals}>
          <div className={styles.totalGroup}>
            <span className={styles.totalGroupLabel}>
              Contratos ({group.contracts_count})
            </span>
            {contractsTotals.length > 0 ? (
              contractsTotals.map(({ currency, total }) => (
                <span key={currency ?? 'sin-moneda'} className={styles.totalAmount}>
                  {formatCurrency(total, currency)}
                </span>
              ))
            ) : (
              <span className={styles.totalAmount}>—</span>
            )}
          </div>
          {group.otros_contratos_count > 0 ? (
            <div className={styles.totalGroup}>
              <span className={styles.totalGroupLabel}>Otros Contratos ({group.otros_contratos_count})</span>
              {otrosContratosTotals.map(({ currency, total }) => (
                <span key={currency ?? 'sin-moneda'} className={styles.totalAmount}>
                  {formatCurrency(total, currency)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </button>
      {isExpanded ? (
        <div className={styles.contracts}>
          <p className={styles.tierExplainer}>
            Nivel {group.nivel ?? 'sin asignar'} se calcula sobre el total de ventas de este vendedor en el periodo
            (contratos + otros contratos), en todas sus subsidiarias: {formatCurrency(group.total_ventas_periodo, null)}{' '}
            → {group.tier_percentage !== null ? `${group.tier_percentage}% de comisión` : 'sin tier configurado'}. Esa
            misma tasa se aplica a cada venta de abajo. Contratos y Otros Contratos se pagan como dos transacciones
            separadas.
          </p>

          {group.contracts.length > 0 ? (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Contratos</h3>
              {group.contracts.map((contract) => (
                <ContractCommissionCard key={contract.netsuite_id} contract={contract} nivel={group.nivel} tierPercentage={group.tier_percentage} />
              ))}
            </section>
          ) : null}

          {group.otros_contratos.length > 0 ? (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Otros Contratos</h3>
              {group.otros_contratos.map((otros) => (
                <OtrosContratoCommissionCard key={otros.netsuite_id} otrosContrato={otros} nivel={group.nivel} tierPercentage={group.tier_percentage} />
              ))}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
