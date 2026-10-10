import { useQuery } from '@tanstack/react-query';
import { fetchReembolsosByMonth } from '../api/reportsApi';
import type { ReembolsoFiltersParams } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useReembolsosByMonth(params: ReembolsoFiltersParams) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['reembolsos-by-month', params.anio, params.empresaId],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchReembolsosByMonth(token, params);
    },
  });
}
