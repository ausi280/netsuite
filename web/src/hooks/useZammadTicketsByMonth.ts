import { useQuery } from '@tanstack/react-query';
import { fetchZammadTicketsByMonth } from '../api/reportsApi';
import type { ZammadTicketsFiltersParams } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useZammadTicketsByMonth(params: ZammadTicketsFiltersParams) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['zammad-tickets-by-month', params.dateFrom, params.dateTo],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchZammadTicketsByMonth(token, params);
    },
  });
}
