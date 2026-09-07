import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteCommissionTier,
  fetchCommissionTiers,
  fetchEmployeeLevels,
  updateEmployeeLevel,
  upsertCommissionTier,
  type UpsertCommissionTierInput,
} from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useEmployeeLevels() {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['employeeLevels'],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchEmployeeLevels(token);
    },
  });
}

export function useUpdateEmployeeLevel() {
  const { getAccessToken } = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ employeeId, nivel }: { employeeId: string; nivel: string | null }) => {
      const token = await getAccessToken();
      await updateEmployeeLevel(token, employeeId, nivel);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeLevels'] });
    },
  });
}

export function useCommissionTiers() {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['commissionTiers'],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchCommissionTiers(token);
    },
  });
}

export function useUpsertCommissionTier() {
  const { getAccessToken } = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpsertCommissionTierInput) => {
      const token = await getAccessToken();
      await upsertCommissionTier(token, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissionTiers'] });
    },
  });
}

export function useDeleteCommissionTier() {
  const { getAccessToken } = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const token = await getAccessToken();
      await deleteCommissionTier(token, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissionTiers'] });
    },
  });
}
