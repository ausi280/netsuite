import { LoadingState } from '../common/LoadingState';
import { ErrorState } from '../common/ErrorState';
import { EmptyState } from '../common/EmptyState';
import { useContractNotas } from '../../hooks/useContractNotas';
import { formatDateTime } from '../../utils/format';
import styles from './NotasCobranzaSection.module.css';

interface NotasCobranzaSectionProps {
  contractId: string;
}

/** Collection-call note history from the pre-NetSuite CryoCell system - until NetSuite-native notes exist, this is the only history there is. */
export function NotasCobranzaSection({ contractId }: NotasCobranzaSectionProps) {
  const { data, isLoading, isError, error, refetch } = useContractNotas(contractId);

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Notas de Cobranza (Sistema Anterior){data ? ` (${data.notas.length})` : ''}</h2>
      {isLoading ? <LoadingState label="Cargando notas..." /> : null}
      {isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'No se pudieron cargar las notas del sistema anterior.'}
          onRetry={() => refetch()}
        />
      ) : null}
      {data && data.folio === null ? (
        <EmptyState message="Este contrato no tiene folio del sistema anterior - probablemente fue creado directamente en NetSuite." />
      ) : null}
      {data && data.folio !== null && data.notas.length === 0 ? (
        <EmptyState message="No hay notas registradas para este contrato." />
      ) : null}
      {data && data.notas.length > 0 ? (
        <div className={styles.list}>
          {data.notas.map((nota, index) => (
            <div className={styles.card} key={index}>
              <div className={styles.cardHeader}>
                <span className={styles.cardDate}>{formatDateTime(nota.fecha)}</span>
                {nota.usuario ? <span className={styles.cardUser}>{nota.usuario}</span> : null}
                {nota.urgente ? <span className={styles.urgentBadge}>Urgente</span> : null}
              </div>
              <p className={styles.cardBody}>{nota.nota ?? '—'}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
