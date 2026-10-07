import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AsignacionTipo, CobranzaCommissionContractGroup } from '../../api/types';
import { partidaStatusLabel, serviceTypeLabel } from '../../config/labels';
import { subsidiaryLabel } from '../../config/subsidiaries';
import { formatCurrency } from '../../utils/format';
import { IMPORTE_PAGADO_CURRENCY, importePagadoNeto } from '../../utils/cobranzaCommissions';
import styles from './CobranzaContractGroupCard.module.css';

interface CobranzaContractGroupCardProps {
  group: CobranzaCommissionContractGroup;
  defaultExpanded?: boolean;
}

const ASIGNADO_BADGE_CLASS: Record<AsignacionTipo, string> = {
  bolsa: 'asignadoBolsa',
  paquete_inicial: 'asignadoPaqueteInicial',
  dueno: 'asignadoDueno',
  cobrador: 'asignadoCobrador',
};

/** One contract's paid-this-month partidas, grouped by año - see
 * api/src-ts/reporting/cobranzaCommissionsRepository.ts for how "paid this month" is determined. */
export function CobranzaContractGroupCard({ group, defaultExpanded = false }: CobranzaContractGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

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
          <Link
            to={`/reports/contracts/${group.contract_id}`}
            className={styles.contractName}
            onClick={(event) => event.stopPropagation()}
          >
            {group.contract_name ?? group.contract_id}
          </Link>
          <p className={styles.meta}>
            {group.folio_sistema_anterior ? `Sistema anterior: ${group.folio_sistema_anterior} · ` : ''}
            Dueño: {group.dueno_nombre ?? 'Sin asignar'} · Cobrador: {group.cobrador_nombre ?? 'Sin asignar'}
            {group.subsidiaria_id ? ` · ${subsidiaryLabel(group.subsidiaria_id)}` : ''}
          </p>
        </div>
        <span className={`${styles.asignadoBadge} ${styles[ASIGNADO_BADGE_CLASS[group.asignado_tipo]]}`}>Asignado a: {group.asignado_a}</span>
        <span className={styles.count}>
          {group.partidas_count} {group.partidas_count === 1 ? 'partida' : 'partidas'}
        </span>
      </button>
      {isExpanded ? (
        <div className={styles.years}>
          {group.years.map((yearGroup) => (
            <div key={yearGroup.anio} className={styles.yearSection}>
              <h3 className={styles.yearTitle}>{yearGroup.anio === 'sin-anio' ? 'Sin año' : yearGroup.anio}</h3>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th>Tipo</th>
                    <th>Vigencia</th>
                    <th>Fecha Límite de Pago</th>
                    <th>Estatus</th>
                    <th>Factura</th>
                    <th>Importe</th>
                    <th>Importe Pagado (neto IVA)</th>
                  </tr>
                </thead>
                <tbody>
                  {yearGroup.partidas.map((partida) => (
                    <tr key={partida.netsuite_id} className={partida.es_paquete_inicial ? styles.rowPaqueteInicial : undefined}>
                      <td>
                        {partida.concepto ?? '—'}
                        {partida.es_paquete_inicial ? (
                          <span
                            className={styles.paqueteInicialBadge}
                            title="Parte del paquete inicial de anualidades pagado junto con el procesamiento - no cuenta en los totales acumulados"
                          >
                            Paquete Inicial de Anualidades
                          </span>
                        ) : null}
                      </td>
                      <td>{serviceTypeLabel(partida.servtipo)}</td>
                      <td>
                        {partida.iniciovigencia ?? '—'} – {partida.finvigencia ?? '—'}
                      </td>
                      <td>{partida.fecha_limite_pago ?? '—'}</td>
                      <td>{partidaStatusLabel(partida.estatus)}</td>
                      <td>{partida.invoice_tranid ?? '—'}</td>
                      <td className={styles.amount}>{formatCurrency(partida.importe, partida.moneda)}</td>
                      <td className={styles.amount}>
                        {importePagadoNeto(partida.importe_pagado) !== null
                          ? formatCurrency(importePagadoNeto(partida.importe_pagado), IMPORTE_PAGADO_CURRENCY)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
