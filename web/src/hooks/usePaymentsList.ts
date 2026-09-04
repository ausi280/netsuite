import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchPaymentsList, type PaymentsListParams } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function usePaymentsList(params: PaymentsListParams) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['payments', params.page, params.pageSize, params.search, params.subsidiary, params.dateFrom, params.dateTo],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchPaymentsList(token, params);
    },
    placeholderData: keepPreviousData,
  });
}
