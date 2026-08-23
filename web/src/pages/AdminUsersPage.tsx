import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { UserPermissionCard } from '../components/admin/UserPermissionCard';
import { useAdminUsers } from '../hooks/useAdminUsers';
import styles from './AdminUsersPage.module.css';

/** Admin-only screen (backend 403s anyone else) - one card per user who has ever logged in, edited and saved independently. */
export function AdminUsersPage() {
  const { data: users, isLoading, isError, error, refetch } = useAdminUsers();

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: 'Administrar usuarios' }]}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Administrar usuarios</h1>
        <p className={styles.subtitle}>
          Cada persona aparece aquí automáticamente la primera vez que inicia sesión. Asigna qué reportes y subsidiarias puede ver.
        </p>
      </div>
      {isLoading ? <LoadingState label="Cargando usuarios..." /> : null}
      {isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'No se pudieron cargar los usuarios.'}
          onRetry={() => refetch()}
        />
      ) : null}
      {!isLoading && !isError && users ? (
        users.length > 0 ? (
          <div className={styles.list}>
            {users.map((user) => (
              <UserPermissionCard key={user.oid} user={user} />
            ))}
          </div>
        ) : (
          <EmptyState message="Todavía nadie ha iniciado sesión." />
        )
      ) : null}
    </AppShell>
  );
}
