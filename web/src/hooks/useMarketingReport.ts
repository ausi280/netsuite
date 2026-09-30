import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchMarketingReport } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useMarketingReport(dateFrom: string, dateTo: string) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['marketing-report', dateFrom, dateTo],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchMarketingReport(token, dateFrom, dateTo);
    },
    placeholderData: keepPreviousData,
  });
}
