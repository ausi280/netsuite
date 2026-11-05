import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPricing, updatePricingDiscount } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function usePricing(enabled = true) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['adminPricing'],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchPricing(token);
    },
    enabled,
  });
}

export function useUpdatePricingDiscount() {
  const { getAccessToken } = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, discount, notas }: { id: number; discount: number; notas: string }) => {
      const token = await getAccessToken();
      await updatePricingDiscount(token, id, discount, notas);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminPricing'] });
    },
  });
}
