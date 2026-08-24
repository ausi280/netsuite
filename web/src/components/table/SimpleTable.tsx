import type { ReactNode } from 'react';
import styles from './SimpleTable.module.css';

export interface SimpleColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

interface SimpleTableProps<T> {
  columns: SimpleColumn<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

/** Small, read-only, non-paginated table for ad-hoc grids (dossier sub-tables, commissions report). */
export function SimpleTable<T>({ columns, rows, getRowKey, emptyMessage = 'Sin registros.', onRowClick }: SimpleTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className={styles.tableWrapper}>
        <p className={styles.empty}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={getRowKey(row, index)}
              className={onRowClick ? styles.clickableRow : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td key={col.key}>{col.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
