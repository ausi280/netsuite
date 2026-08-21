import { LogLevel, PublicClientApplication } from '@azure/msal-browser';
import type { Configuration } from '@azure/msal-browser';

const rawClientId = import.meta.env.VITE_MSAL_CLIENT_ID ?? '';
const rawTenantId = import.meta.env.VITE_MSAL_TENANT_ID ?? '';
const rawRedirectUri = import.meta.env.VITE_MSAL_REDIRECT_URI ?? '';
const rawApiScope = import.meta.env.VITE_MSAL_API_SCOPE ?? '';

const clientId = rawClientId.trim();
const tenantId = rawTenantId.trim();
const redirectUri = rawRedirectUri.trim() || window.location.origin;
const apiScope = rawApiScope.trim();

/**
 * The Entra ID App Registration doesn't exist yet in every environment (e.g. a fresh
 * checkout before the portal steps are completed). Every consumer of this module must
 * check this flag before assuming MSAL can be used - it guards `npm run dev`/`npm run build`
 * and the Login page from crashing on a missing configuration.
 */
export const isMsalConfigured = Boolean(clientId && tenantId);

/** Scope requested for the access token sent to this app's own reporting API. */
export const apiScopes = apiScope ? [apiScope] : [];

const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri,
    postLogoutRedirectUri: redirectUri,
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) {
          console.error('[MSAL]', message);
        }
      },
    },
  },
};

/** Scopes requested at sign-in time. Falls back to basic OIDC scopes if the API scope isn't set yet. */
export const loginRequest = {
  scopes: apiScopes.length > 0 ? apiScopes : ['openid', 'profile'],
};

/**
 * Constructs the MSAL PublicClientApplication instance, or `null` when the App Registration
 * hasn't been configured yet (blank VITE_MSAL_CLIENT_ID / VITE_MSAL_TENANT_ID). Never throws.
 */
export function createMsalInstance(): PublicClientApplication | null {
  if (!isMsalConfigured) return null;
  return new PublicClientApplication(msalConfig);
}
