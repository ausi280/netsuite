import styles from './common.module.css';

interface EmptyStateProps {
  message?: string;
}

export function EmptyState({ message = 'No hay resultados para mostrar.' }: EmptyStateProps) {
  return (
    <div className={styles.wrapper}>
      <p className={styles.message}>{message}</p>
    </div>
  );
}
