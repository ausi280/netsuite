import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { MultiSelectDropdown } from '../components/common/MultiSelectDropdown';
import { VendedorGroupCard } from '../components/reports/VendedorGroupCard';
import { useCommissions } from '../hooks/useCommissions';
import { useEntities } from '../hooks/useEntities';
import { useSubsidiaryOptions } from '../hooks/useSubsidiaryOptions';
import { subsidiaryLabel } from '../config/subsidiaries';
import { currencyLabel, KNOWN_CURRENCY_IDS } from '../config/currencies';
import { formatCurrency } from '../utils/format';
import { sumContractsByCurrency, sumOtrosContratosByCurrency } from '../utils/commissions';
import { fetchCommissionsExportCsv, fetchCommissionsPdf } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';
import { downloadBlob } from '../utils/downloadBlob';
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
  const { getAccessToken } = useApiToken();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const now = new Date();
  const month = Number(searchParams.get('month')) || now.getMonth() + 1;
  const year = Number(searchParams.get('year')) || now.getFullYear();
  const subsidiary = (searchParams.get('subsidiary') ?? '').split(',').filter(Boolean);
  const currency = searchParams.get('currency') ?? '';

  // Whether /reports/contracts (and its subsidiary-options/commission-levels routes) are reachable
  // at all - independent from whether commissions itself is scoped to everyone or just this caller
  // (see isSelfVendedor below). Having 'contracts' no longer implies full commissions access on
  // its own ('commissions' is now a second, additional gate on top of it), but it still gates
  // these other contracts-entity routes exactly as before.
  const { data: entitiesResult } = useEntities();
  const hasContractsAccess = Boolean(entitiesResult?.entities.some((e) => e.key === 'contracts'));

  const { data: result, isLoading, isError, error, refetch } = useCommissions(month, year, subsidiary, currency);
  const data = result?.groups;
  // Authoritative per the commissions response itself, not guessed from the entities list - a
  // caller can have 'contracts' yet still be self-vendedor-scoped here if they lack 'commissions'.
  const isSelfVendedor = result?.isSelfVendedor ?? false;
  const { data: subsidiaryOptions } = useSubsidiaryOptions('contracts', { enabled: hasContractsAccess });

  const summary = useMemo(() => {
    if (!data) return null;
    const contractsCount = data.reduce((sum, group) => sum + group.contracts_count, 0);
    const otrosContratosCount = data.reduce((sum, group) => sum + group.otros_contratos_count, 0);
    return {
      vendedoresCount: data.length,
      contractsCount,
      otrosContratosCount,
      contractsTotalsByCurrency: sumContractsByCurrency(data),
      otrosContratosTotalsByCurrency: sumOtrosContratosByCurrency(data),
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

  async function handleExport() {
    setIsExporting(true);
    setExportError(null);
    try {
      const token = await getAccessToken();
      const blob = await fetchCommissionsExportCsv(token, month, year, subsidiary, currency || undefined);
      downloadBlob(blob, `comisiones-${year}-${String(month).padStart(2, '0')}.csv`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'No se pudo exportar el CSV.');
    } finally {
      setIsExporting(false);
    }
  }

  async function handlePrint() {
    setIsGeneratingPdf(true);
    setPdfError(null);
    try {
      const token = await getAccessToken();
      const blob = await fetchCommissionsPdf(token, month, year, subsidiary, currency || undefined);
      downloadBlob(blob, `estado-cuenta-comisiones-${year}-${String(month).padStart(2, '0')}.pdf`);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : 'No se pudo generar el PDF.');
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  return (
    <AppShell
      breadcrumbs={
        hasContractsAccess
          ? [{ label: 'Reportes', to: '/' }, { label: 'Contratos', to: '/reports/contracts' }, { label: 'Comisiones' }]
          : [{ label: 'Reportes', to: '/' }, { label: 'Comisiones' }]
      }
    >
      <div className={styles.heading}>
        <div>
          <h1 className={styles.title}>{isSelfVendedor ? 'Mis comisiones' : 'Comisiones de contratos nuevos'}</h1>
          <p className={styles.subtitle}>
            {isSelfVendedor
              ? 'Tus contratos nuevos, filtrados por el mes y año de su fecha de inicio.'
              : 'Contratos nuevos por vendedor, filtrados por el mes y año de su fecha de inicio.'}
          </p>
        </div>
        <div className={styles.actions}>
          {hasContractsAccess ? (
            <Link to="/reports/contracts/commission-levels" className={styles.levelsLink}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 21V9" />
                <path d="M4 9l4-4" />
                <path d="M12 21V3" />
                <path d="M20 21v-7" />
              </svg>
              Configurar niveles
            </Link>
          ) : null}
          <button type="button" className={styles.actionButton} onClick={handleExport} disabled={isExporting}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="M7 10l5 5 5-5" />
              <path d="M4 20h16" />
            </svg>
            {isExporting ? 'Exportando...' : 'Exportar CSV'}
          </button>
          <button type="button" className={styles.actionButton} onClick={handlePrint} disabled={isGeneratingPdf}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            {isGeneratingPdf ? 'Generando PDF...' : 'Imprimir PDF'}
          </button>
        </div>
      </div>
      {exportError ? <p className={styles.exportError}>{exportError}</p> : null}
      {pdfError ? <p className={styles.exportError}>{pdfError}</p> : null}
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
        {hasContractsAccess ? (
          <MultiSelectDropdown
            value={subsidiary}
            options={subsidiaryOptions ?? []}
            onChange={handleSubsidiaryChange}
            labelForId={subsidiaryLabel}
            placeholder="Todas las subsidiarias"
            ariaLabel="Filtrar por subsidiaria"
          />
        ) : null}
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
          {summary.otrosContratosCount > 0 ? (
            <div className={styles.summaryStat}>
              <span className={styles.summaryValue}>{summary.otrosContratosCount}</span>
              <span className={styles.summaryLabel}>otros contratos</span>
            </div>
          ) : null}
          <div className={styles.summaryDivider} />
          {summary.contractsTotalsByCurrency.map(({ currency: curr, total }) => (
            <div className={styles.summaryStat} key={`contratos-${curr ?? 'sin-moneda'}`}>
              <span className={styles.summaryValue}>{formatCurrency(total, curr)}</span>
              <span className={styles.summaryLabel}>comisión contratos {curr ? `(${currencyLabel(curr)})` : ''}</span>
            </div>
          ))}
          {summary.otrosContratosTotalsByCurrency.map(({ currency: curr, total }) => (
            <div className={styles.summaryStat} key={`otros-${curr ?? 'sin-moneda'}`}>
              <span className={styles.summaryValue}>{formatCurrency(total, curr)}</span>
              <span className={styles.summaryLabel}>comisión otros contratos {curr ? `(${currencyLabel(curr)})` : ''}</span>
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
