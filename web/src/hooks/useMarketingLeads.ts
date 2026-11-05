import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchMarketingLeads, type MarketingLeadsFilters } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useMarketingLeads(filters: MarketingLeadsFilters, page: number, pageSize: number) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['marketing-leads', filters, page, pageSize],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchMarketingLeads(token, filters, page, pageSize);
    },
    placeholderData: keepPreviousData,
  });
}
