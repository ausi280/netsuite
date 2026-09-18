import { LoadingState } from '../common/LoadingState';
import { ErrorState } from '../common/ErrorState';
import { EmptyState } from '../common/EmptyState';
import { useContractNetSuiteNotes } from '../../hooks/useContractNetSuiteNotes';
import { formatDateTime } from '../../utils/format';
import styles from './NotasCobranzaSection.module.css';

interface NetSuiteNotesSectionProps {
  contractId: string;
}

/** NetSuite-native note history (the note.nl UI page), reached via a SuiteScript RESTlet since
 * this data isn't reachable through SuiteQL - see api/src-ts/reporting/netsuiteNotesRepository.ts. */
export function NetSuiteNotesSection({ contractId }: NetSuiteNotesSectionProps) {
  const { data, isLoading, isError, error, refetch } = useContractNetSuiteNotes(contractId);

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Notas de NetSuite{data ? ` (${data.length})` : ''}</h2>
      {isLoading ? <LoadingState label="Cargando notas..." /> : null}
      {isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'No se pudieron cargar las notas de NetSuite.'}
          onRetry={() => refetch()}
        />
      ) : null}
      {data && data.length === 0 ? <EmptyState message="Este contrato no tiene notas en NetSuite." /> : null}
      {data && data.length > 0 ? (
        <div className={styles.list}>
          {data.map((nota) => (
            <div className={styles.card} key={nota.id}>
              <div className={styles.cardHeader}>
                <span className={styles.cardDate}>{formatDateTime(nota.date)}</span>
                {nota.author ? <span className={styles.cardUser}>{nota.author}</span> : null}
                {nota.noteType ? <span className={styles.typeTag}>{nota.noteType}</span> : null}
                {nota.urgente ? <span className={styles.urgentBadge}>Urgente</span> : null}
              </div>
              {nota.title ? <p className={styles.cardTitle}>{nota.title}</p> : null}
              <p className={styles.cardBody}>{nota.note ?? '—'}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
