import { useEffect, useState, type PropsWithChildren, type ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { isMsalConfigured, loginRequest } from './msalConfig';
import { LoadingState } from '../components/common/LoadingState';

/**
 * Redirects to /login when the user isn't authenticated in THIS TAB. MSAL's cache is
 * sessionStorage-scoped (per-tab, intentionally - not localStorage), so a freshly opened tab
 * has no account even if another tab is signed in. Before giving up, this tries a silent SSO
 * check via a hidden iframe against Microsoft's own session cookie (which IS shared across
 * tabs) - if that existing Microsoft session is still valid, the new tab picks it up silently
 * instead of bouncing to the login page.
 */
export function RequireAuth({ children }: PropsWithChildren): ReactElement | null {
  const isAuthenticated = useIsAuthenticated();
  const { instance, inProgress } = useMsal();
  const location = useLocation();
  const [ssoChecked, setSsoChecked] = useState(!isMsalConfigured);

  useEffect(() => {
    if (!isMsalConfigured || isAuthenticated || ssoChecked || inProgress !== InteractionStatus.None) return;

    instance
      .ssoSilent(loginRequest)
      .catch(() => {
        // No existing Microsoft session to pick up (or interaction is genuinely required) -
        // falls through to the /login redirect below.
      })
      .finally(() => setSsoChecked(true));
  }, [isAuthenticated, ssoChecked, inProgress, instance]);

  if (isAuthenticated) {
    return <>{children}</>;
  }

  if (!ssoChecked) {
    return <LoadingState label="Verificando sesión..." />;
  }

  return <Navigate to="/login" replace state={{ from: location }} />;
}
