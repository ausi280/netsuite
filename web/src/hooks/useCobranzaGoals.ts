import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchCobranzaGoals,
  setCobranzaGoalDefault,
  setCobranzaGoalExclusion,
  setCobranzaGoalOverride,
  type CobranzaGoalDefaultInput,
  type CobranzaGoalOverrideInput,
} from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useCobranzaGoals(month: number, year: number) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['cobranza-goals', month, year],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchCobranzaGoals(token, month, year);
    },
  });
}

export function useSetCobranzaGoalDefault() {
  const { getAccessToken } = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CobranzaGoalDefaultInput) => {
      const token = await getAccessToken();
      await setCobranzaGoalDefault(token, input);
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ['cobranza-goals', input.month, input.year] });
    },
  });
}

export function useSetCobranzaGoalOverride() {
  const { getAccessToken } = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ employeeId, input }: { employeeId: string; input: CobranzaGoalOverrideInput }) => {
      const token = await getAccessToken();
      await setCobranzaGoalOverride(token, employeeId, input);
    },
    onSuccess: (_data, { input }) => {
      queryClient.invalidateQueries({ queryKey: ['cobranza-goals', input.month, input.year] });
    },
  });
}

export function useSetCobranzaGoalExclusion() {
  const { getAccessToken } = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ employeeId, excluded }: { employeeId: string; excluded: boolean }) => {
      const token = await getAccessToken();
      await setCobranzaGoalExclusion(token, employeeId, excluded);
    },
    onSuccess: () => {
      // Exclusions apply to every month, so every cached month's goals are stale.
      queryClient.invalidateQueries({ queryKey: ['cobranza-goals'] });
    },
  });
}
