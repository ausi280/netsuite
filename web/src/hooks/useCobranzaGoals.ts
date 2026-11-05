import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchCobranzaGoals,
  setCobranzaGoalDefault,
  setCobranzaGoalExclusion,
  setCobranzaGoalOverride,
  setCobranzaAgentScheme,
  type CobranzaGoalDefaultInput,
  type CobranzaGoalExclusionInput,
  type CobranzaGoalOverrideInput,
} from '../api/reportsApi';
import type { IncentiveScheme } from '../api/types';
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
    mutationFn: async ({ employeeId, input }: { employeeId: string; input: CobranzaGoalExclusionInput }) => {
      const token = await getAccessToken();
      await setCobranzaGoalExclusion(token, employeeId, input);
    },
    onSuccess: () => {
      // Later months not edited yet show this month's exclusions, so they're stale too.
      queryClient.invalidateQueries({ queryKey: ['cobranza-goals'] });
    },
  });
}

export function useSetCobranzaAgentScheme() {
  const { getAccessToken } = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ employeeId, input }: { employeeId: string; input: { month: number; year: number; scheme: IncentiveScheme | null } }) => {
      const token = await getAccessToken();
      await setCobranzaAgentScheme(token, employeeId, input);
    },
    onSuccess: () => {
      // Later months not configured yet show this month's esquemas, so they're stale too.
      queryClient.invalidateQueries({ queryKey: ['cobranza-goals'] });
    },
  });
}
