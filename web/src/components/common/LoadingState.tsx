import styles from './common.module.css';

interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = 'Cargando...' }: LoadingStateProps) {
  return (
    <div className={styles.wrapper} role="status" aria-live="polite">
      <div className={styles.spinner} />
      <p className={styles.message}>{label}</p>
    </div>
  );
}
