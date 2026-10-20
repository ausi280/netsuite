import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchMarketingTickets } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useMarketingTickets(dateFrom: string, dateTo: string) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['marketing-tickets', dateFrom, dateTo],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchMarketingTickets(token, dateFrom, dateTo);
    },
    placeholderData: keepPreviousData,
  });
}
