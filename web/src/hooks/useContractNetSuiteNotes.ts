import { useQuery } from '@tanstack/react-query';
import { fetchContractNetSuiteNotes } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

/** Fetched independently of the dossier query - a NetSuite RESTlet hiccup here shouldn't block the rest of the contract view. */
export function useContractNetSuiteNotes(id: string, options: { enabled?: boolean } = {}) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['contractNetSuiteNotes', id],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchContractNetSuiteNotes(token, id);
    },
    enabled: options.enabled ?? true,
  });
}
