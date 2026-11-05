import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchComercialVentas } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useComercialVentas(dateFrom: string, dateTo: string) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['comercial-ventas', dateFrom, dateTo],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchComercialVentas(token, dateFrom, dateTo);
    },
    placeholderData: keepPreviousData,
  });
}
