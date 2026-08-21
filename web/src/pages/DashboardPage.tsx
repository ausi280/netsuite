import { AppShell } from '../components/layout/AppShell';
import { TileGrid } from '../components/tiles/TileGrid';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { useEntities } from '../hooks/useEntities';
import styles from './DashboardPage.module.css';

export function DashboardPage() {
  const { data: entities, isLoading, isError, error, refetch } = useEntities();

  return (
    <AppShell>
      <div className={styles.heading}>
        <h1 className={styles.title}>Reportes</h1>
        <p className={styles.subtitle}>Datos sincronizados desde NetSuite, agrupados por entidad.</p>
      </div>
      {isLoading ? <LoadingState label="Cargando entidades..." /> : null}
      {isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'No se pudieron cargar las entidades.'}
          onRetry={() => refetch()}
        />
      ) : null}
      {!isLoading && !isError && entities ? (
        entities.length > 0 ? <TileGrid entities={entities} /> : <EmptyState message="No hay entidades disponibles." />
      ) : null}
    </AppShell>
  );
}
