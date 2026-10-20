import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchMarketingReport } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

import type { MarketingPais } from '../api/types';

export function useMarketingReport(pais: MarketingPais, dateFrom: string, dateTo: string, marca = '') {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['marketing-report', pais, dateFrom, dateTo, marca],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchMarketingReport(token, pais, dateFrom, dateTo, marca);
    },
    placeholderData: keepPreviousData,
  });
}
