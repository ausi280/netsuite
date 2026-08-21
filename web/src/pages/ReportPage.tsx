import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { ReportToolbar } from '../components/table/ReportToolbar';
import { ReportTable } from '../components/table/ReportTable';
import { Pagination } from '../components/table/Pagination';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { entityColumns, getSubsidiaryColumnKey } from '../config/entityColumns';
import { useEntityRows } from '../hooks/useEntityRows';
import { useSubsidiaryOptions } from '../hooks/useSubsidiaryOptions';
import type { ReportEntityKey, ReportRow, SortDir } from '../api/types';
import { NotFoundPage } from './NotFoundPage';
import styles from './ReportPage.module.css';

const DEFAULT_PAGE_SIZE = 25;

function isValidEntityKey(key: string | undefined): key is ReportEntityKey {
  return Boolean(key) && Object.prototype.hasOwnProperty.call(entityColumns, key as string);
}

export function ReportPage() {
  const { entityKey: rawEntityKey } = useParams<{ entityKey: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const isValid = isValidEntityKey(rawEntityKey);
  // Falls back to a placeholder key when invalid purely so hooks below are always called in the
  // same order every render (Rules of Hooks) - the query itself is disabled via `enabled: isValid`,
  // and we render <NotFoundPage /> below regardless of anything this fallback would have fetched.
  const entityKey = (isValid ? rawEntityKey : 'customers') as ReportEntityKey;
  const config = entityColumns[entityKey];

  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const pageSize = Number(searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE;
  const search = searchParams.get('search') ?? '';
  const sortBy = searchParams.get('sortBy') ?? config.defaultSort?.sortBy ?? '';
  const sortDir: SortDir = searchParams.get('sortDir') === 'desc' ? 'desc' : searchParams.get('sortDir') === 'asc' ? 'asc' : config.defaultSort?.sortDir ?? 'asc';
  const subsidiaryColumn = getSubsidiaryColumnKey(entityKey);
  const subsidiary = subsidiaryColumn ? searchParams.get('subsidiary') ?? '' : '';

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useEntityRows(entityKey, { page, pageSize, search, sortBy, sortDir, subsidiary }, { enabled: isValid });

  const { data: subsidiaryOptions } = useSubsidiaryOptions(entityKey, { enabled: isValid && Boolean(subsidiaryColumn) });

  if (!isValid) {
    return <NotFoundPage />;
  }

  function updateParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    setSearchParams(next);
  }

  function handleSearchChange(value: string) {
    updateParams({ search: value || null, page: '1' });
  }

  function handleSubsidiaryChange(value: string) {
    updateParams({ subsidiary: value || null, page: '1' });
  }

  function handleSortChange(columnKey: string) {
    const def = config.defaultSort;

    if (sortBy !== columnKey) {
      updateParams({ sortBy: columnKey, sortDir: 'asc', page: '1' });
      return;
    }

    if (sortDir === 'asc') {
      updateParams({ sortDir: 'desc', page: '1' });
      return;
    }

    // Currently descending on this column. When this column IS the entity default sorted
    // descending, "reset to default" would be a visual no-op, so toggle back to ascending
    // instead - the cycle still always lands on the default (desc) as its resting state.
    if (def && def.sortBy === columnKey && def.sortDir === 'desc') {
      updateParams({ sortDir: 'asc', page: '1' });
      return;
    }

    if (def) {
      updateParams({ sortBy: def.sortBy, sortDir: def.sortDir, page: '1' });
    } else {
      updateParams({ sortDir: 'asc', page: '1' });
    }
  }

  function handlePageChange(nextPage: number) {
    updateParams({ page: String(nextPage) });
  }

  function handlePageSizeChange(nextPageSize: number) {
    updateParams({ pageSize: String(nextPageSize), page: '1' });
  }

  function handleRowClick(row: ReportRow) {
    const id = row.netsuite_id;
    if (id !== undefined && id !== null && id !== '') {
      navigate(`/reports/${entityKey}/${id}`);
    }
  }

  const numberFormatter = new Intl.NumberFormat('es-MX');
  const totalLabel = data ? `${numberFormatter.format(data.total)} registros` : '';

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: config.label }]}>
      <div className={styles.heading}>
        <h1 className={styles.title}>{config.label}</h1>
      </div>
      <ReportToolbar
        initialSearch={search}
        onSearchChange={handleSearchChange}
        totalLabel={totalLabel}
        subsidiaryFilter={
          subsidiaryColumn
            ? { value: subsidiary, options: subsidiaryOptions ?? [], onChange: handleSubsidiaryChange }
            : undefined
        }
      />
      {isLoading ? <LoadingState label={`Cargando ${config.label.toLowerCase()}...`} /> : null}
      {isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'No se pudieron cargar los registros.'}
          onRetry={() => refetch()}
        />
      ) : null}
      {!isLoading && !isError && data ? (
        data.data.length > 0 ? (
          <>
            <ReportTable
              columns={config.columns}
              rows={data.data}
              sortBy={sortBy}
              sortDir={sortDir}
              onSortChange={handleSortChange}
              onRowClick={handleRowClick}
            />
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              totalPages={data.totalPages}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          </>
        ) : (
          <EmptyState message="No hay registros que coincidan con la búsqueda." />
        )
      ) : null}
    </AppShell>
  );
}
