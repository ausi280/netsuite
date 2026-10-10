import { useQuery } from '@tanstack/react-query';
import { fetchReembolsosCerradosByMonth } from '../api/reportsApi';
import type { ReembolsoFiltersParams } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useReembolsosCerradosByMonth(params: ReembolsoFiltersParams) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['reembolsos-cerrados-by-month', params.anio, params.empresaId],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchReembolsosCerradosByMonth(token, params);
    },
  });
}
