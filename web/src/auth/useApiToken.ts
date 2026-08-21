import { useCallback } from 'react';
import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { apiScopes } from './msalConfig';

/**
 * Resolves an access token for the reporting API scope, trying a silent (cached/refresh)
 * acquisition first and falling back to a full-page redirect when interaction is required
 * (expired session, revoked consent, Conditional Access step-up, etc.). Redirect is used
 * instead of a popup since it is far more reliable through MFA/Conditional Access flows.
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
      if (error instanceof InteractionRequiredAuthError) {
        // Navigates away from the app; nothing after this call will run in this tab.
        await instance.acquireTokenRedirect(request);
        return null;
      }
      throw error;
    }
  }, [instance, accounts]);

  return { getAccessToken };
}
