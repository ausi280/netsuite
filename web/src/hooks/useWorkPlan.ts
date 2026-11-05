import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cloneWorkPlan,
  createWorkPlanActivity,
  deleteWorkPlanActivity,
  fetchWorkPlan,
  saveWorkPlanHeader,
  updateWorkPlanActivity,
  type WorkPlanTarget,
} from '../api/reportsApi';
import type { WorkPlanActivityInput } from '../api/types';
import { useApiToken } from '../auth/useApiToken';

export function useWorkPlan(month: number, year: number, vendedor: string) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['work-plan', month, year, vendedor],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchWorkPlan(token, month, year, vendedor || undefined);
    },
  });
}

/** Every work-plan mutation invalidates all cached plans - a clone or edit can touch another month's view. */
function useWorkPlanMutation<TVars, TResult = void>(fn: (token: string | null, vars: TVars) => Promise<TResult>) {
  const { getAccessToken } = useApiToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: TVars) => fn(await getAccessToken(), vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-plan'] });
    },
  });
}

export function useSaveWorkPlanHeader() {
  return useWorkPlanMutation((token, { target, input }: { target: WorkPlanTarget; input: { puesto: string | null; objetivos: string[] } }) =>
    saveWorkPlanHeader(token, target, input),
  );
}

/** Creates when `id` is absent, updates otherwise. */
export function useSaveWorkPlanActivity() {
  return useWorkPlanMutation((token, { target, id, input }: { target: WorkPlanTarget; id?: number; input: WorkPlanActivityInput }) =>
    id ? updateWorkPlanActivity(token, id, input) : createWorkPlanActivity(token, target, input),
  );
}

export function useDeleteWorkPlanActivity() {
  return useWorkPlanMutation((token, id: number) => deleteWorkPlanActivity(token, id));
}

export function useCloneWorkPlan() {
  return useWorkPlanMutation((token, { target, from }: { target: WorkPlanTarget; from: { month: number; year: number } }) =>
    cloneWorkPlan(token, target, from),
  );
}
