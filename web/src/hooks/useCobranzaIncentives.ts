import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCobranzaIncentives, saveCobranzaIncentives } from '../api/reportsApi';
import type { CobranzaIncentiveConfig } from '../api/types';
import { useApiToken } from '../auth/useApiToken';

export function useCobranzaIncentives(month: number, year: number) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['cobranza-incentives', month, year],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchCobranzaIncentives(token, month, year);
    },
  });
}

export function useSaveCobranzaIncentives() {
  const { getAccessToken } = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CobranzaIncentiveConfig) => {
      const token = await getAccessToken();
      await saveCobranzaIncentives(token, input);
    },
    onSuccess: () => {
      // A month with nothing captured shows the latest earlier month as its starting point, so
      // saving one month can change what later months show.
      queryClient.invalidateQueries({ queryKey: ['cobranza-incentives'] });
    },
  });
}
