import { useQuery } from '@tanstack/react-query';
import { fetchReembolsosByCausa } from '../api/reportsApi';
import type { ReembolsoFiltersParams } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useReembolsosByCausa(params: ReembolsoFiltersParams) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['reembolsos-by-causa', params.anio, params.empresaId],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchReembolsosByCausa(token, params);
    },
  });
}
