import { useEffect, useState } from 'react';
import type { AdminUserSummary } from '../../api/types';
import type { ReportEntityKey } from '../../api/types';
import { entityColumns, entityOrder } from '../../config/entityColumns';
import { KNOWN_SUBSIDIARY_IDS, subsidiaryLabel } from '../../config/subsidiaries';
import { useUpdateUserPermissions } from '../../hooks/useAdminUsers';
import styles from './UserPermissionCard.module.css';

interface UserPermissionCardProps {
  user: AdminUserSummary;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const dateFormatter = new Intl.DateTimeFormat('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });

/** One user's editable permission card: admin toggle + entity/subsidiary checklists, saved on demand. */
export function UserPermissionCard({ user }: UserPermissionCardProps) {
  const [isAdmin, setIsAdmin] = useState(user.isAdmin);
  const [entities, setEntities] = useState<ReportEntityKey[]>(user.allowedEntities);
  const [subsidiaries, setSubsidiaries] = useState<string[]>(user.allowedSubsidiaries);
  const [justSaved, setJustSaved] = useState(false);

  const mutation = useUpdateUserPermissions();

  // Resync local edit state if the server data changes underneath us (e.g. another admin edited it).
  useEffect(() => {
    setIsAdmin(user.isAdmin);
    setEntities(user.allowedEntities);
    setSubsidiaries(user.allowedSubsidiaries);
  }, [user.isAdmin, user.allowedEntities, user.allowedSubsidiaries]);

  const isDirty =
    isAdmin !== user.isAdmin ||
    entities.length !== user.allowedEntities.length ||
    entities.some((e) => !user.allowedEntities.includes(e)) ||
    subsidiaries.length !== user.allowedSubsidiaries.length ||
    subsidiaries.some((s) => !user.allowedSubsidiaries.includes(s));

  function handleSave() {
    setJustSaved(false);
    mutation.mutate(
      { oid: user.oid, update: { isAdmin, allowedEntities: entities, allowedSubsidiaries: subsidiaries } },
      { onSuccess: () => setJustSaved(true) },
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.name}>{user.displayName || '(sin nombre)'}</span>
        <span className={styles.email}>{user.email || user.oid}</span>
      </div>
      <p className={styles.meta}>Registrado el {dateFormatter.format(new Date(user.createdAt))}</p>

      <label className={styles.adminRow}>
        <input type="checkbox" checked={isAdmin} onChange={(event) => setIsAdmin(event.target.checked)} />
        <span className={styles.adminLabel}>Super administrador</span>
        <span className={styles.adminHint}>(ve todo, ignora las listas de abajo)</span>
      </label>

      <div className={`${styles.sections} ${isAdmin ? styles.sectionsDisabled : ''}`}>
        <div>
          <p className={styles.sectionTitle}>Reportes permitidos</p>
          <div className={styles.checkList}>
            {entityOrder.map((key) => (
              <label className={styles.checkItem} key={key}>
                <input type="checkbox" checked={entities.includes(key)} onChange={() => setEntities((prev) => toggle(prev, key))} />
                {entityColumns[key].label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className={styles.sectionTitle}>Subsidiarias permitidas</p>
          <div className={styles.checkList}>
            {KNOWN_SUBSIDIARY_IDS.map((id) => (
              <label className={styles.checkItem} key={id}>
                <input type="checkbox" checked={subsidiaries.includes(id)} onChange={() => setSubsidiaries((prev) => toggle(prev, id))} />
                {subsidiaryLabel(id)}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.saveButton} onClick={handleSave} disabled={!isDirty || mutation.isPending}>
          {mutation.isPending ? 'Guardando...' : 'Guardar'}
        </button>
        {justSaved && !isDirty ? <span className={styles.savedNote}>Guardado ✓</span> : null}
        {mutation.isError ? (
          <span className={styles.errorNote}>{mutation.error instanceof Error ? mutation.error.message : 'No se pudo guardar.'}</span>
        ) : null}
      </div>
    </div>
  );
}
