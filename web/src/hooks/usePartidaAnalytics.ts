import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchPartidaAnalytics } from '../api/reportsApi';
import type { PartidaDimension } from '../api/types';
import { useApiToken } from '../auth/useApiToken';

export function usePartidaAnalytics(dimension: PartidaDimension) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['partidaAnalytics', dimension],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchPartidaAnalytics(token, dimension);
    },
    staleTime: 60 * 1000,
    // Holds the previous tab's chart on screen (no skeleton flash) while the next one loads.
    placeholderData: keepPreviousData,
  });
}
