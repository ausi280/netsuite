import { useMutation } from '@tanstack/react-query';
import { submitLogisticaTicket } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useSubmitLogisticaTicket() {
  const { getAccessToken } = useApiToken();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      const token = await getAccessToken();
      return submitLogisticaTicket(token, formData);
    },
  });
}
