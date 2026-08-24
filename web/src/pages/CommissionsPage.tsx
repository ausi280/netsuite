import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { SimpleTable } from '../components/table/SimpleTable';
import type { SimpleColumn } from '../components/table/SimpleTable';
import { useCommissions } from '../hooks/useCommissions';
import { useSubsidiaryOptions } from '../hooks/useSubsidiaryOptions';
import type { CommissionRow } from '../api/types';
import { contractStatusLabel } from '../config/labels';
import { subsidiaryLabel } from '../config/subsidiaries';
import { formatCurrency, formatDate, formatCellValue } from '../utils/format';
import styles from './CommissionsPage.module.css';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, index) => CURRENT_YEAR - index);

const COLUMNS: SimpleColumn<CommissionRow>[] = [
  { key: 'vendedor', header: 'Vendedor', render: (r) => r.vendedor_nombre ?? r.vendedor_id },
  { key: 'contrato', header: 'Contrato', render: (r) => r.name ?? r.netsuite_id },
  { key: 'numero', header: 'No. Contrato', render: (r) => formatCellValue(r.numero_contrato) },
  { key: 'titular', header: 'Titular', render: (r) => r.titular_nombre ?? '—' },
  { key: 'fecha', header: 'Fecha Inicio', render: (r) => formatDate(r.fecha_inicio) },
  { key: 'estatus', header: 'Estatus', render: (r) => contractStatusLabel(r.estatus) },
  { key: 'subsidiaria', header: 'Subsidiaria', render: (r) => (r.subsidiaria_id ? subsidiaryLabel(r.subsidiaria_id) : '—') },
  { key: 'saldo', header: 'Saldo Inicial', render: (r) => formatCurrency(r.saldo_inicial) },
  { key: 'total', header: 'Total', render: (r) => formatCurrency(r.total) },
];

/** Grid of new contracts (start-date month/year filter) with their salesperson, for calculating/paying commissions. */
export function CommissionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const now = new Date();
  const month = Number(searchParams.get('month')) || now.getMonth() + 1;
  const year = Number(searchParams.get('year')) || now.getFullYear();
  const subsidiary = searchParams.get('subsidiary') ?? '';

  const { data, isLoading, isError, error, refetch } = useCommissions(month, year, subsidiary);
  const { data: subsidiaryOptions } = useSubsidiaryOptions('contracts');

  const summary = useMemo(() => {
    if (!data) return null;
    const salespeople = new Set<string>();
    let total = 0;
    for (const row of data) {
      salespeople.add(row.vendedor_nombre ?? row.vendedor_id);
      total += row.total ?? 0;
    }
    return { count: data.length, salespeopleCount: salespeople.size, total };
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

  function handleSubsidiaryChange(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set('subsidiary', value);
    } else {
      next.delete('subsidiary');
    }
    setSearchParams(next);
  }

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: 'Contratos', to: '/reports/contracts' }, { label: 'Comisiones' }]}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Comisiones de contratos nuevos</h1>
        <p className={styles.subtitle}>
          Contratos nuevos por vendedor, filtrados por el mes y año de su fecha de inicio.
        </p>
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
        <select
          className={styles.select}
          value={subsidiary}
          onChange={(event) => handleSubsidiaryChange(event.target.value)}
          aria-label="Filtrar por subsidiaria"
        >
          <option value="">Todas las subsidiarias</option>
          {(subsidiaryOptions ?? []).map((id) => (
            <option key={id} value={id}>
              {subsidiaryLabel(id)}
            </option>
          ))}
        </select>
        {summary ? (
          <div className={styles.summary}>
            <span>
              <strong>{summary.count}</strong> contratos
            </span>
            <span>
              <strong>{summary.salespeopleCount}</strong> vendedores
            </span>
            <span>
              <strong>{formatCurrency(summary.total)}</strong> total
            </span>
          </div>
        ) : null}
      </div>
      {isLoading ? <LoadingState label="Cargando comisiones..." /> : null}
      {isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'No se pudieron cargar las comisiones.'}
          onRetry={() => refetch()}
        />
      ) : null}
      {!isLoading && !isError && data ? (
        <SimpleTable
          columns={COLUMNS}
          rows={data}
          getRowKey={(row) => row.netsuite_id}
          emptyMessage="No hay contratos nuevos con vendedor asignado para este mes."
          onRowClick={(row) => navigate(`/reports/contracts/${row.netsuite_id}`)}
        />
      ) : null}
    </AppShell>
  );
}
