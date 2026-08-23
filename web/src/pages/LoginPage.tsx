import { Navigate } from 'react-router-dom';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { isMsalConfigured, loginRequest } from '../auth/msalConfig';
import styles from './LoginPage.module.css';

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export function LoginPage() {
  const { instance } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  function handleLogin() {
    instance.loginRedirect(loginRequest);
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brandMark} aria-hidden="true">
          C
        </div>
        <h1 className={styles.title}>Cryoholdco Reportes</h1>
        <p className={styles.subtitle}>Panel de reportes de datos sincronizados desde NetSuite.</p>
        {/*
        <p className={styles.credits}>
          Créditos: a mi mamá, María, Mike, al Jefazo Jorge, a todos los directores de marketing y Juan
        </p>
        */}
        {isMsalConfigured ? (
          <button type="button" className={styles.loginButton} onClick={handleLogin}>
            <MicrosoftLogo />
            Iniciar sesión con Microsoft
          </button>
        ) : (
          <p className={styles.notice}>
            El inicio de sesión con Microsoft aún no está configurado para esta aplicación. Contacta al
            administrador para completar la configuración de Entra ID.
          </p>
        )}
      </div>
    </div>
  );
}
