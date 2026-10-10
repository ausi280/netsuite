import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchTareasVencidas } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useTareasVencidas(
  dateFrom: string,
  dateTo: string,
  vendedorIds: number[],
  page: number,
  pageSize: number,
  activoOnly: boolean,
  /** False while the Comercial page's Global view is active - the detail table only ever renders
   * in Por Vendedor view, so there's no reason to fetch it while Global is showing. */
  enabled = true,
) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['tareas-vencidas', dateFrom, dateTo, vendedorIds, page, pageSize, activoOnly],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchTareasVencidas(token, { dateFrom, dateTo, vendedorIds, page, pageSize, activoOnly });
    },
    placeholderData: keepPreviousData,
    enabled,
  });
}
