import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAdminUsers, updateAdminUserPermissions } from '../api/reportsApi';
import type { UserPermissionUpdate } from '../api/types';
import { useApiToken } from '../auth/useApiToken';

export function useAdminUsers() {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['adminUsers'],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchAdminUsers(token);
    },
  });
}

export function useUpdateUserPermissions() {
  const { getAccessToken } = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ oid, update }: { oid: string; update: UserPermissionUpdate }) => {
      const token = await getAccessToken();
      await updateAdminUserPermissions(token, oid, update);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
    },
  });
}
