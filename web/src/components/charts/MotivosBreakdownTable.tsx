import type { MarketingMotivoBreakdownRow, MarketingPais, ProspectoQualificationCategory } from '../../api/types';
import { MARKETING_PAISES } from '../../utils/marketingPais';
import styles from './charts.module.css';

interface MotivosBreakdownTableProps {
  rows: MarketingMotivoBreakdownRow[];
  formatCount: (value: number) => string;
  /** México rows are per empresa + Cryo.dbo.noventa id; Argentina's per marca + NetSuite motivo de pérdida id. */
  pais: MarketingPais;
}

// Matches MarketingQualificationChart's own SERIES_COLORS (kept in sync manually, same
// convention as this file's separate EMPRESA_LABELS/MONTH_LABELS duplication).
const CATEGORY_COLORS: Record<ProspectoQualificationCategory, string> = {
  Calificados: 'var(--color-primary)',
  'No contactado': 'var(--color-neutral-300)',
  'Lead no calificado': 'var(--color-neutral-800)',
};

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatMonth(anio: number, mes: number): string {
  return `${MONTH_LABELS[mes - 1] ?? mes} ${anio}`;
}

/**
 * Every distinct (año, mes, empresa, ID_NoVenta, motivo) combination present in the period, with
 * the category it was resolved into - always visible (not collapsed behind a toggle like
 * ChartTable), per explicit instruction to keep this transparent and broken down by month: if a
 * motivo looks miscategorized, this table is where you'd see it and know exactly which raw
 * Cryo.dbo.noventa row (and which month) to re-map in api/src-ts/reporting/marketingRepository.ts.
 */
export function MotivosBreakdownTable({ rows, formatCount, pais }: MotivosBreakdownTableProps) {
  const config = MARKETING_PAISES[pais];
  return (
    <div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Mes</th>
            <th>{config.empresaHeader}</th>
            <th>ID motivo</th>
            <th>{config.motivoHeader}</th>
            <th>Categoría</th>
            <th>Prospectos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.anio}-${row.mes}-${row.id_empresa}-${row.id_noventa ?? 'null'}`}>
              <td>{formatMonth(row.anio, row.mes)}</td>
              <td>{config.empresaLabels[row.id_empresa] ?? row.id_empresa}</td>
              <td>{row.id_noventa ?? '—'}</td>
              <td>{row.motivo}</td>
              <td>
                <span className={styles.legendItem}>
                  <span className={styles.legendSwatch} style={{ backgroundColor: CATEGORY_COLORS[row.categoria] }} aria-hidden="true" />
                  {row.categoria}
                </span>
              </td>
              <td>{formatCount(row.cantidad)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
