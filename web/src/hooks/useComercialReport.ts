import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchComercialReport } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useComercialReport(dateFrom: string, dateTo: string) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['comercial-report', dateFrom, dateTo],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchComercialReport(token, dateFrom, dateTo);
    },
    placeholderData: keepPreviousData,
  });
}
