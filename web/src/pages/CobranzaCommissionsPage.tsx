import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AsignacionTipo } from '../api/types';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { MultiSelectDropdown } from '../components/common/MultiSelectDropdown';
import { CobranzaContractGroupCard } from '../components/reports/CobranzaContractGroupCard';
import { AssigneeSummaryTiles } from '../components/reports/AssigneeSummaryTiles';
import { useCobranzaCommissions } from '../hooks/useCobranzaCommissions';
import { useEntities } from '../hooks/useEntities';
import { useSubsidiaryOptions } from '../hooks/useSubsidiaryOptions';
import { subsidiaryLabel } from '../config/subsidiaries';
import { fetchCobranzaCommissionsExportCsv } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';
import { downloadBlob } from '../utils/downloadBlob';
import styles from './CommissionsPage.module.css';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, index) => CURRENT_YEAR - index);

const TIPO_LABELS: Record<AsignacionTipo, string> = {
  dueno: 'Dueño',
  cobrador: 'Cobrador',
  bolsa: 'Bolsa',
  paquete_inicial: 'Paquete Inicial',
};

interface AssignmentOption {
  key: string;
  label: string;
  tipo: AsignacionTipo;
}

function assignmentKey(tipo: AsignacionTipo, name: string): string {
  return `${tipo}:${name}`;
}

/** Which partidas (services) got paid this month, grouped by contract and, within each contract,
 * by año - see api/src-ts/reporting/cobranzaCommissionsRepository.ts for how "paid this month" is
 * determined. A first pass: lists what was paid and by/for whom, no commission amount/rate
 * computed yet. */
export function CobranzaCommissionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { getAccessToken } = useApiToken();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [assignmentFilter, setAssignmentFilter] = useState('');

  const now = new Date();
  const month = Number(searchParams.get('month')) || now.getMonth() + 1;
  const year = Number(searchParams.get('year')) || now.getFullYear();
  const subsidiary = (searchParams.get('subsidiary') ?? '').split(',').filter(Boolean);

  const { data: result, isLoading, isError, error, refetch } = useCobranzaCommissions(month, year, subsidiary);
  const data = result?.data;
  // The subsidiary-options endpoint is gated by the 'partidas' entity grant, which a caller with
  // only 'cobranza_commissions' (granted precisely so they DON'T need 'partidas' too) may lack -
  // same precedent as CommissionsPage's hasContractsAccess check. Skip fetching it, and hide the
  // filter, rather than let it fail with a silent 403.
  const { data: entitiesResult } = useEntities();
  const hasPartidasAccess = Boolean(entitiesResult?.entities.some((e) => e.key === 'partidas'));
  const { data: subsidiaryOptions } = useSubsidiaryOptions('partidas', { enabled: hasPartidasAccess });

  const summary = useMemo(() => {
    if (!data) return null;
    const partidasCount = data.reduce((sum, group) => sum + group.partidas_count, 0);
    const bolsaCount = data.filter((group) => group.asignado_tipo === 'bolsa').length;
    const cobradorCount = data.filter((group) => group.asignado_tipo === 'cobrador').length;
    const paqueteInicialCount = data.filter((group) => group.asignado_tipo === 'paquete_inicial').length;
    return { contractsCount: data.length, partidasCount, bolsaCount, cobradorCount, paqueteInicialCount };
  }, [data]);

  // Grouped by (tipo, name) - not just name - since the same person can be credited as Dueño on
  // one contract and as Cobrador on another, and those are different buckets to filter by. Sorted
  // so "Bolsa" and "Paquete inicial de anualidades" (shared pools, not people) always sit last.
  const assignmentOptions = useMemo((): AssignmentOption[] => {
    if (!data) return [];
    const seen = new Map<string, AssignmentOption>();
    for (const group of data) {
      const key = assignmentKey(group.asignado_tipo, group.asignado_a);
      if (seen.has(key)) continue;
      const label =
        group.asignado_tipo === 'dueno' || group.asignado_tipo === 'cobrador'
          ? `${group.asignado_a} (${TIPO_LABELS[group.asignado_tipo]})`
          : group.asignado_a;
      seen.set(key, { key, label, tipo: group.asignado_tipo });
    }

    const tipoOrder: Record<AsignacionTipo, number> = { dueno: 0, cobrador: 0, paquete_inicial: 1, bolsa: 2 };
    return Array.from(seen.values()).sort((a, b) => {
      const diff = tipoOrder[a.tipo] - tipoOrder[b.tipo];
      return diff !== 0 ? diff : a.label.localeCompare(b.label);
    });
  }, [data]);

  const filteredData = useMemo(() => {
    if (!data) return data;
    if (!assignmentFilter) return data;
    return data.filter((group) => assignmentKey(group.asignado_tipo, group.asignado_a) === assignmentFilter);
  }, [data, assignmentFilter]);

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

  async function handleExport() {
    setIsExporting(true);
    setExportError(null);
    try {
      const token = await getAccessToken();
      const blob = await fetchCobranzaCommissionsExportCsv(token, month, year, subsidiary);
      downloadBlob(blob, `cobranza-comisiones-${year}-${String(month).padStart(2, '0')}.csv`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'No se pudo exportar el CSV.');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <AppShell
      breadcrumbs={
        hasPartidasAccess
          ? [{ label: 'Reportes', to: '/' }, { label: 'Partidas', to: '/reports/partidas' }, { label: 'Comisiones de Cobranza' }]
          : [{ label: 'Reportes', to: '/' }, { label: 'Comisiones de Cobranza' }]
      }
    >
      <div className={styles.heading}>
        <div>
          <h1 className={styles.title}>Comisiones de Cobranza</h1>
          <p className={styles.subtitle}>Partidas pagadas en el mes, agrupadas por contrato y por año de servicio.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.actionButton} onClick={handleExport} disabled={isExporting}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="M7 10l5 5 5-5" />
              <path d="M4 20h16" />
            </svg>
            {isExporting ? 'Exportando...' : 'Exportar CSV'}
          </button>
        </div>
      </div>
      {exportError ? <p className={styles.exportError}>{exportError}</p> : null}
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
        {hasPartidasAccess ? (
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
          value={assignmentFilter}
          onChange={(event) => setAssignmentFilter(event.target.value)}
          aria-label="Filtrar por asignado a"
        >
          <option value="">Todos los asignados</option>
          {assignmentOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {summary ? (
        <div className={styles.summaryBar}>
          <div className={styles.summaryStat}>
            <span className={styles.summaryValue}>{summary.contractsCount}</span>
            <span className={styles.summaryLabel}>contratos</span>
          </div>
          <div className={styles.summaryStat}>
            <span className={styles.summaryValue}>{summary.partidasCount}</span>
            <span className={styles.summaryLabel}>partidas pagadas</span>
          </div>
          <div className={styles.summaryStat}>
            <span className={styles.summaryValue}>{summary.cobradorCount}</span>
            <span className={styles.summaryLabel}>asignados a Cobrador</span>
          </div>
          <div className={styles.summaryStat}>
            <span className={styles.summaryValue}>{summary.bolsaCount}</span>
            <span className={styles.summaryLabel}>asignados a Bolsa</span>
          </div>
          <div className={styles.summaryStat}>
            <span className={styles.summaryValue}>{summary.paqueteInicialCount}</span>
            <span className={styles.summaryLabel}>paquete inicial de anualidades</span>
          </div>
        </div>
      ) : null}
      {data && data.length > 0 ? <AssigneeSummaryTiles groups={data} /> : null}
      {isLoading ? <LoadingState label="Cargando comisiones de cobranza..." /> : null}
      {isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'No se pudieron cargar las comisiones de cobranza.'}
          onRetry={() => refetch()}
        />
      ) : null}
      {!isLoading && !isError && filteredData ? (
        filteredData.length > 0 ? (
          <div className={styles.groups}>
            {filteredData.map((group) => (
              <CobranzaContractGroupCard key={group.contract_id} group={group} />
            ))}
          </div>
        ) : (
          <EmptyState
            message={assignmentFilter ? 'No hay contratos asignados a este seleccionado.' : 'No hay partidas pagadas para este mes.'}
          />
        )
      ) : null}
    </AppShell>
  );
}
