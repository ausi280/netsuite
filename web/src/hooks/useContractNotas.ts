import { useQuery } from '@tanstack/react-query';
import { fetchContractNotas } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

/** Fetched independently of the dossier query - a legacy-DB hiccup here shouldn't block the rest of the contract view. */
export function useContractNotas(id: string, options: { enabled?: boolean } = {}) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['contractNotas', id],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchContractNotas(token, id);
    },
    enabled: options.enabled ?? true,
  });
}
