import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { UserMenu } from './UserMenu';
import cryoholdcoLogo from '../../assets/cryoholdco-logo.png';
import styles from './AppShell.module.css';

export interface Breadcrumb {
  label: string;
  to?: string;
}

interface AppShellProps {
  breadcrumbs?: Breadcrumb[];
  children: ReactNode;
}

/** Minimal top header (brand mark + page context + user menu) - deliberately no side navigation. */
export function AppShell({ breadcrumbs = [], children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link to="/" className={styles.brand}>
            <img src={cryoholdcoLogo} alt="Cryoholdco" className={styles.brandLogo} />
            <span className={styles.brandName}>Reportes</span>
          </Link>
          {breadcrumbs.length > 0 ? (
            <>
              <span className={styles.divider} aria-hidden="true" />
              <nav className={styles.context} aria-label="Ruta actual">
                {breadcrumbs.map((crumb, index) => {
                  const isLast = index === breadcrumbs.length - 1;
                  return (
                    <span key={`${crumb.label}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {index > 0 ? <span aria-hidden="true">/</span> : null}
                      {crumb.to && !isLast ? (
                        <Link to={crumb.to} className={styles.contextLink}>
                          {crumb.label}
                        </Link>
                      ) : (
                        <span className={isLast ? styles.contextCurrent : undefined}>{crumb.label}</span>
                      )}
                    </span>
                  );
                })}
              </nav>
            </>
          ) : null}
        </div>
        <UserMenu />
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
