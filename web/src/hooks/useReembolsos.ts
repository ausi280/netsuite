import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchReembolsos } from '../api/reportsApi';
import type { ReembolsosParams } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useReembolsos(params: ReembolsosParams) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['reembolsos', params.anio, params.empresaId, params.page, params.pageSize],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchReembolsos(token, params);
    },
    placeholderData: keepPreviousData,
  });
}
