import { useQuery } from '@tanstack/react-query';
import { fetchTareaVencidaVendedores } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useTareaVencidaVendedores(dateFrom: string, dateTo: string, enabled = true) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['tareas-vencidas-vendedores', dateFrom, dateTo],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchTareaVencidaVendedores(token, dateFrom, dateTo);
    },
    enabled,
  });
}
