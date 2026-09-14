import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateContract } from '../api/reportsApi';
import type { UpdateContractInput } from '../api/types';
import { useApiToken } from '../auth/useApiToken';

export function useUpdateContract(id: string) {
  const { getAccessToken } = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateContractInput) => {
      const token = await getAccessToken();
      await updateContract(token, id, input);
    },
    onSuccess: () => {
      // Refetches the whole dossier (resolved vendedor_nombre included) rather than patching the
      // cache by hand - a single extra small read is simpler and can't drift from what NetSuite
      // + the local mirror actually ended up with.
      queryClient.invalidateQueries({ queryKey: ['contractDossier', id] });
    },
  });
}
