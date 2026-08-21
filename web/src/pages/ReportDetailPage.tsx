import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { entityColumns } from '../config/entityColumns';
import { useEntityRecord } from '../hooks/useEntityRecord';
import type { ReportEntityKey } from '../api/types';
import { formatCellValue, humanizeKey } from '../utils/format';
import { NotFoundPage } from './NotFoundPage';
import styles from './ReportDetailPage.module.css';

function isValidEntityKey(key: string | undefined): key is ReportEntityKey {
  return Boolean(key) && Object.prototype.hasOwnProperty.call(entityColumns, key as string);
}

export function ReportDetailPage() {
  const { entityKey: rawEntityKey, id: rawId } = useParams<{ entityKey: string; id: string }>();
  const [showRaw, setShowRaw] = useState(false);

  const isValid = isValidEntityKey(rawEntityKey) && Boolean(rawId);
  const entityKey = (isValid ? rawEntityKey : 'customers') as ReportEntityKey;
  const id = rawId ?? '';
  const config = entityColumns[entityKey];

  const { data, isLoading, isError, error, refetch } = useEntityRecord(entityKey, id, { enabled: isValid });

  if (!isValid) {
    return <NotFoundPage />;
  }

  const fields = data
    ? Object.entries(data).filter(([key]) => key !== 'raw_data')
    : [];

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: config.label, to: `/reports/${entityKey}` }, { label: id }]}>
      <Link to={`/reports/${entityKey}`} className={styles.backLink}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Volver a {config.label}
      </Link>
      <div className={styles.heading}>
        <h1 className={styles.title}>{config.label} · {id}</h1>
      </div>
      {isLoading ? <LoadingState label="Cargando registro..." /> : null}
      {isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'No se pudo cargar el registro.'}
          onRetry={() => refetch()}
        />
      ) : null}
      {data ? (
        <>
          <div className={styles.card}>
            <div className={styles.grid}>
              {fields.map(([key, value]) => (
                <div className={styles.field} key={key}>
                  <p className={styles.fieldLabel}>{humanizeKey(key)}</p>
                  <p className={styles.fieldValue}>{formatCellValue(value)}</p>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.rawSection}>
            <button
              type="button"
              className={styles.rawToggle}
              onClick={() => setShowRaw((value) => !value)}
              aria-expanded={showRaw}
            >
              <svg
                className={`${styles.chevron} ${showRaw ? styles.chevronOpen : ''}`}
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Datos completos (JSON)
            </button>
            {showRaw ? <pre className={styles.rawContent}>{JSON.stringify(data.raw_data, null, 2)}</pre> : null}
          </div>
        </>
      ) : null}
    </AppShell>
  );
}
