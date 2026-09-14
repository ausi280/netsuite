import { useQuery } from '@tanstack/react-query';
import { fetchVendedorOptions } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

/** Only fetched once the "Vendedor" field's picker is actually opened (see `enabled`) - nobody
 * pays for this list of ~500+ employees just to view a contract. */
export function useVendedorOptions(enabled: boolean) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['vendedorOptions'],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchVendedorOptions(token);
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
