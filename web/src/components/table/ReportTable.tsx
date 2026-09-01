import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import type { EntityColumn } from '../../config/entityColumns';
import type { ReportRow, SortDir } from '../../api/types';
import { formatCellValue } from '../../utils/format';
import styles from './ReportTable.module.css';

interface ReportTableProps {
  columns: EntityColumn[];
  rows: ReportRow[];
  sortBy: string;
  sortDir: SortDir;
  onSortChange: (columnKey: string) => void;
  onRowClick: (row: ReportRow) => void;
}

function SortIcon({ active, direction }: { active: boolean; direction?: SortDir }) {
  const rotation = direction === 'asc' ? 0 : 180;
  return (
    <svg
      className={`${styles.sortIcon} ${active ? styles.sortIconActive : ''}`}
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      style={active ? { transform: `rotate(${rotation}deg)` } : undefined}
      aria-hidden="true"
    >
      <polyline points="6 15 12 9 18 15" />
    </svg>
  );
}

/**
 * @tanstack/react-table used purely for column/header/sort-icon plumbing, fully in manual mode:
 * it never sees more than one already-paginated page of rows, and all sorting/filtering/pagination
 * state lives in the URL (see ReportPage) rather than inside the table instance.
 */
export function ReportTable({ columns, rows, sortBy, sortDir, onSortChange, onRowClick }: ReportTableProps) {
  const columnDefs: ColumnDef<ReportRow, unknown>[] = columns.map((col) => ({
    id: col.key,
    accessorFn: (row) => row[col.key],
    header: col.header,
    cell: (info) => {
      const currencyId = col.currencyColumn ? (info.row.original[col.currencyColumn] as string | null | undefined) : undefined;
      return formatCellValue(info.getValue(), col.format, currencyId);
    },
  }));

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
  });

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const columnConfig = columns.find((c) => c.key === header.column.id);
                const isSortable = Boolean(columnConfig?.sortable);
                const isActive = sortBy === header.column.id;

                if (!isSortable) {
                  return <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>;
                }

                return (
                  <th key={header.id}>
                    <span
                      className={styles.sortableHeader}
                      onClick={() => onSortChange(header.column.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSortChange(header.column.id);
                        }
                      }}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <SortIcon active={isActive} direction={isActive ? sortDir : undefined} />
                    </span>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} onClick={() => onRowClick(row.original)}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
