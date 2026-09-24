import { useCallback } from 'react';
import { useMsal } from '@azure/msal-react';
import { BrowserAuthError, InteractionRequiredAuthError } from '@azure/msal-browser';
import { apiScopes } from './msalConfig';

// Hidden-iframe silent renewal missing Azure AD's response window - a transient network/
// third-party-cookie hiccup, not an auth failure, so it gets the same redirect fallback as an
// actual InteractionRequiredAuthError (see https://aka.ms/msal.js.errors#timed_out).
const TIMED_OUT_ERROR_CODE = 'timed_out';

function requiresInteraction(error: unknown): boolean {
  if (error instanceof InteractionRequiredAuthError) return true;
  return error instanceof BrowserAuthError && error.errorCode === TIMED_OUT_ERROR_CODE;
}

/**
 * Resolves an access token for the reporting API scope, trying a silent (cached/refresh)
 * acquisition first and falling back to a full-page redirect when interaction is required
 * (expired session, revoked consent, Conditional Access step-up, or a timed-out silent renewal
 * - see requiresInteraction). Redirect is used instead of a popup since it is far more reliable
 * through MFA/Conditional Access flows.
 */
export function useApiToken() {
  const { instance, accounts } = useMsal();

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const account = accounts[0];
    if (!account || apiScopes.length === 0) {
      return null;
    }

    const request = { scopes: apiScopes, account };

    try {
      const result = await instance.acquireTokenSilent(request);
      return result.accessToken;
    } catch (error) {
      if (requiresInteraction(error)) {
        // Navigates away from the app; nothing after this call will run in this tab.
        await instance.acquireTokenRedirect(request);
        return null;
      }
      throw error;
    }
  }, [instance, accounts]);

  return { getAccessToken };
}
