import { useQuery } from '@tanstack/react-query';
import { fetchHrSummary } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

/** `enabled` lets callers (e.g. the dashboard tile) skip firing this admin-only request entirely
 * until they already know the signed-in user is an admin - avoiding a guaranteed 403 for everyone else. */
export function useHrSummary(enabled = true) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['hrSummary'],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchHrSummary(token);
    },
    enabled,
    staleTime: 60 * 1000,
  });
}
