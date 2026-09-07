import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { MultiSelectDropdown } from '../components/common/MultiSelectDropdown';
import { VendedorGroupCard } from '../components/reports/VendedorGroupCard';
import { useCommissions } from '../hooks/useCommissions';
import { useSubsidiaryOptions } from '../hooks/useSubsidiaryOptions';
import { subsidiaryLabel } from '../config/subsidiaries';
import { currencyLabel, KNOWN_CURRENCY_IDS } from '../config/currencies';
import { formatCurrency } from '../utils/format';
import { sumCommissionByCurrency } from '../utils/commissions';
import styles from './CommissionsPage.module.css';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, index) => CURRENT_YEAR - index);

/** New-contract sales commissions, grouped by vendedor, with every contract's calculation broken
 * down (Placenta's flat 3%, the tiered rate on everything else, the $100-per-year anualidad
 * bonus) so it's clear why each number is what it is. */
export function CommissionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const now = new Date();
  const month = Number(searchParams.get('month')) || now.getMonth() + 1;
  const year = Number(searchParams.get('year')) || now.getFullYear();
  const subsidiary = (searchParams.get('subsidiary') ?? '').split(',').filter(Boolean);
  const currency = searchParams.get('currency') ?? '';

  const { data, isLoading, isError, error, refetch } = useCommissions(month, year, subsidiary, currency);
  const { data: subsidiaryOptions } = useSubsidiaryOptions('contracts');

  const summary = useMemo(() => {
    if (!data) return null;
    const allContracts = data.flatMap((group) => group.contracts);
    return {
      vendedoresCount: data.length,
      contractsCount: allContracts.length,
      totalsByCurrency: sumCommissionByCurrency(allContracts),
    };
  }, [data]);

  function handleMonthChange(value: string) {
    const next = new URLSearchParams(searchParams);
    next.set('month', value);
    setSearchParams(next);
  }

  function handleYearChange(value: string) {
    const next = new URLSearchParams(searchParams);
    next.set('year', value);
    setSearchParams(next);
  }

  function handleSubsidiaryChange(ids: string[]) {
    const next = new URLSearchParams(searchParams);
    if (ids.length > 0) {
      next.set('subsidiary', ids.join(','));
    } else {
      next.delete('subsidiary');
    }
    setSearchParams(next);
  }

  function handleCurrencyChange(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set('currency', value);
    } else {
      next.delete('currency');
    }
    setSearchParams(next);
  }

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: 'Contratos', to: '/reports/contracts' }, { label: 'Comisiones' }]}>
      <div className={styles.heading}>
        <div>
          <h1 className={styles.title}>Comisiones de contratos nuevos</h1>
          <p className={styles.subtitle}>
            Contratos nuevos por vendedor, filtrados por el mes y año de su fecha de inicio.
          </p>
        </div>
        <Link to="/reports/contracts/commission-levels" className={styles.levelsLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M4 21V9" />
            <path d="M4 9l4-4" />
            <path d="M12 21V3" />
            <path d="M20 21v-7" />
          </svg>
          Configurar niveles
        </Link>
      </div>
      <div className={styles.filters}>
        <select className={styles.select} value={month} onChange={(event) => handleMonthChange(event.target.value)} aria-label="Mes">
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>
        <select className={styles.select} value={year} onChange={(event) => handleYearChange(event.target.value)} aria-label="Año">
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <MultiSelectDropdown
          value={subsidiary}
          options={subsidiaryOptions ?? []}
          onChange={handleSubsidiaryChange}
          labelForId={subsidiaryLabel}
          placeholder="Todas las subsidiarias"
          ariaLabel="Filtrar por subsidiaria"
        />
        <select
          className={styles.select}
          value={currency}
          onChange={(event) => handleCurrencyChange(event.target.value)}
          aria-label="Filtrar por moneda"
        >
          <option value="">Todas las monedas</option>
          {KNOWN_CURRENCY_IDS.map((id) => (
            <option key={id} value={id}>
              {currencyLabel(id)}
            </option>
          ))}
        </select>
      </div>
      {summary ? (
        <div className={styles.summaryBar}>
          <div className={styles.summaryStat}>
            <span className={styles.summaryValue}>{summary.vendedoresCount}</span>
            <span className={styles.summaryLabel}>vendedores</span>
          </div>
          <div className={styles.summaryStat}>
            <span className={styles.summaryValue}>{summary.contractsCount}</span>
            <span className={styles.summaryLabel}>contratos nuevos</span>
          </div>
          <div className={styles.summaryDivider} />
          {summary.totalsByCurrency.map(({ currency: curr, total }) => (
            <div className={styles.summaryStat} key={curr ?? 'sin-moneda'}>
              <span className={styles.summaryValue}>{formatCurrency(total, curr)}</span>
              <span className={styles.summaryLabel}>comisión total {curr ? `(${currencyLabel(curr)})` : ''}</span>
            </div>
          ))}
        </div>
      ) : null}
      {isLoading ? <LoadingState label="Cargando comisiones..." /> : null}
      {isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'No se pudieron cargar las comisiones.'}
          onRetry={() => refetch()}
        />
      ) : null}
      {!isLoading && !isError && data ? (
        data.length > 0 ? (
          <div className={styles.groups}>
            {data.map((group) => (
              <VendedorGroupCard key={group.vendedor_id} group={group} />
            ))}
          </div>
        ) : (
          <EmptyState message="No hay contratos nuevos con vendedor asignado para este mes." />
        )
      ) : null}
    </AppShell>
  );
}
