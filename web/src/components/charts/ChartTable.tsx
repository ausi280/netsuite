import { useState } from 'react';
import type { PartidaBreakdownRow } from '../../api/types';
import styles from './charts.module.css';

interface ChartTableProps {
  rows: PartidaBreakdownRow[];
  formatLabel: (key: string) => string;
  formatCount: (value: number) => string;
  formatSum: (value: number) => string;
}

/** Every chart's WCAG-clean twin - the same breakdown as a plain table, always reachable without hovering. */
export function ChartTable({ rows, formatLabel, formatCount, formatSum }: ChartTableProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.tableSection}>
      <button type="button" className={styles.tableToggle} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <svg
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        Ver tabla
      </button>
      {open ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Categoría</th>
              <th>Cantidad</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{formatLabel(row.key)}</td>
                <td>{formatCount(row.count)}</td>
                <td>{formatSum(row.sum)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
