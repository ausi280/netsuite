import { useEffect, useRef, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { Link } from 'react-router-dom';
import { useEntities } from '../../hooks/useEntities';
import styles from './UserMenu.module.css';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function UserMenu() {
  const { instance, accounts } = useMsal();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Reuses the same react-query cache entry the dashboard's tile fetch already populated (same
  // queryKey) - no extra request just to know whether to show the admin link.
  const { data } = useEntities();

  const account = accounts[0];

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (!account) {
    return null;
  }

  const displayName = account.name || account.username;

  function handleSignOut() {
    instance.logoutRedirect();
  }

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className={styles.avatar} aria-hidden="true">
          {getInitials(displayName)}
        </span>
        <span className={styles.name}>{displayName}</span>
        <svg
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open ? (
        <div className={styles.dropdown} role="menu">
          <div className={styles.dropdownEmail}>{account.username}</div>
          {data?.isAdmin ? (
            <Link to="/admin/users" className={styles.adminLink} role="menuitem" onClick={() => setOpen(false)}>
              Administrar usuarios
            </Link>
          ) : null}
          <button type="button" className={styles.signOutButton} role="menuitem" onClick={handleSignOut}>
            Cerrar sesión
          </button>
        </div>
      ) : null}
    </div>
  );
}
