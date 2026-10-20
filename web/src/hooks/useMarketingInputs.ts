import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMarketingInputs, saveMarketingInputs } from '../api/reportsApi';
import type { MarketingMonthlyInputs, MarketingPais } from '../api/types';
import { useApiToken } from '../auth/useApiToken';

export function useMarketingInputs(pais: MarketingPais, year: number) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['marketing-inputs', pais, year],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchMarketingInputs(token, pais, year);
    },
  });
}

export function useSaveMarketingInputs(pais: MarketingPais) {
  const { getAccessToken } = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: MarketingMonthlyInputs) => {
      const token = await getAccessToken();
      await saveMarketingInputs(token, pais, input);
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ['marketing-inputs', pais, input.year] });
      // The report's funnel reads these too.
      queryClient.invalidateQueries({ queryKey: ['marketing-report'] });
    },
  });
}
