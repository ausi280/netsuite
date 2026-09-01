import { useEffect, useState } from 'react';
import { subsidiaryLabel } from '../../config/subsidiaries';
import styles from './ReportToolbar.module.css';

interface SubsidiaryFilterProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

interface ReportToolbarProps {
  initialSearch: string;
  onSearchChange: (value: string) => void;
  totalLabel: string;
  /** Omit entirely when the entity has no subsidiary column synced - the dropdown won't render. */
  subsidiaryFilter?: SubsidiaryFilterProps;
  /** Omit to hide the export button entirely (not used yet on every page that renders this toolbar). */
  onExport?: () => void;
  isExporting?: boolean;
}

const DEBOUNCE_MS = 350;

/** Search input debounced ~350ms before bubbling up to the URL-driven query state. */
export function ReportToolbar({ initialSearch, onSearchChange, totalLabel, subsidiaryFilter, onExport, isExporting }: ReportToolbarProps) {
  const [value, setValue] = useState(initialSearch);

  // Keep the local input in sync if the URL param changes from elsewhere (e.g. back/forward nav).
  useEffect(() => {
    setValue(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (value !== initialSearch) {
        onSearchChange(value);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // Intentionally only re-runs when `value` changes - `initialSearch`/`onSearchChange`
    // are read for comparison/invocation but shouldn't themselves restart the debounce timer.
  }, [value]);

  return (
    <div className={styles.toolbar}>
      <div className={styles.searchWrapper}>
        <svg
          className={styles.searchIcon}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Buscar..."
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label="Buscar"
        />
      </div>
      {subsidiaryFilter ? (
        <select
          className={styles.subsidiarySelect}
          value={subsidiaryFilter.value}
          onChange={(event) => subsidiaryFilter.onChange(event.target.value)}
          aria-label="Filtrar por subsidiaria"
        >
          <option value="">Todas las subsidiarias</option>
          {subsidiaryFilter.options.map((id) => (
            <option key={id} value={id}>
              {subsidiaryLabel(id)}
            </option>
          ))}
        </select>
      ) : null}
      <span className={styles.total}>{totalLabel}</span>
      {onExport ? (
        <button type="button" className={styles.exportButton} onClick={onExport} disabled={isExporting}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 3v12" />
            <path d="M7 10l5 5 5-5" />
            <path d="M4 20h16" />
          </svg>
          {isExporting ? 'Exportando...' : 'Exportar CSV'}
        </button>
      ) : null}
    </div>
  );
}
