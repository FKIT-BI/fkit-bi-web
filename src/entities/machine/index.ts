import { useQuery } from '@tanstack/react-query';
import { api, type CurrentState, type Machine } from '@/shared/api';
import { useNow } from '@/shared/model';

export type { Machine, CurrentState };
export { StateBadge, StateDot } from './StateBadge';

export function useCurrentStates(enterpriseId: string | undefined) {
  const now = useNow();
  const q = useQuery({
    ...api.currentStates(enterpriseId ?? '', now),
    enabled: !!enterpriseId,
    placeholderData: (prev) => prev,
  });
  const byMachine = new Map((q.data ?? []).map((s) => [s.machineId, s]));
  return { ...q, byMachine };
}

export function useMachine(id: string) {
  return useQuery(api.machine(id));
}
