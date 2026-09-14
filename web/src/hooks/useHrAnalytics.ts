import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchHrAnalytics } from '../api/reportsApi';
import type { HrDimension } from '../api/types';
import { useApiToken } from '../auth/useApiToken';

export function useHrAnalytics(dimension: HrDimension, activeOnly: boolean) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['hrAnalytics', dimension, activeOnly],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchHrAnalytics(token, dimension, activeOnly);
    },
    staleTime: 60 * 1000,
    // Holds the previous tab's chart on screen (no skeleton flash) while the next one loads.
    placeholderData: keepPreviousData,
  });
}
