import { useEffect, useRef, useState } from 'react';
import styles from './MultiSelectDropdown.module.css';

interface MultiSelectDropdownProps {
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  labelForId?: (id: string) => string;
  /** Shown on the trigger button when nothing is selected. */
  placeholder: string;
  ariaLabel: string;
  /** Shows a filter box above the options - for longer lists (e.g. vendedores). */
  searchable?: boolean;
  /** Trigger text when several are selected, after the count - defaults to "seleccionadas". */
  selectedCountLabel?: string;
}

/** A checkbox-list dropdown for selecting zero or more of a small set of ids (subsidiaries) -
 * a native `<select multiple>` requires ctrl/cmd-click, which isn't discoverable, so this rolls
 * its own popover instead. Selecting toggles immediately, same as every other filter in the app -
 * there's no separate "apply" step. */
export function MultiSelectDropdown({
  options,
  value,
  onChange,
  labelForId,
  placeholder,
  ariaLabel,
  searchable = false,
  selectedCountLabel = 'seleccionadas',
}: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const label = labelForId ?? ((id: string) => id);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  const buttonLabel =
    value.length === 0 ? placeholder : value.length === 1 ? label(value[0]) : `${value.length} ${selectedCountLabel}`;
  const term = search.trim().toLowerCase();
  const visibleOptions = term ? options.filter((id) => label(id).toLowerCase().includes(term)) : options;

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={`${styles.trigger} ${value.length > 0 ? styles.triggerActive : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
      >
        <span className={styles.triggerLabel}>{buttonLabel}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen ? (
        <div className={styles.panel} role="listbox" aria-label={ariaLabel}>
          {searchable ? (
            <input
              type="search"
              className={styles.search}
              placeholder="Buscar"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label={`Buscar en ${ariaLabel}`}
              autoFocus
            />
          ) : null}
          {value.length > 0 ? (
            <button type="button" className={styles.clearButton} onClick={() => onChange([])}>
              Limpiar selección
            </button>
          ) : null}
          {visibleOptions.map((id) => (
            <label key={id} className={styles.option}>
              <input type="checkbox" checked={value.includes(id)} onChange={() => toggle(id)} />
              {label(id)}
            </label>
          ))}
          {visibleOptions.length === 0 ? <p className={styles.empty}>{options.length === 0 ? 'Sin opciones' : 'Sin coincidencias'}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
