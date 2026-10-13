import { useQueries, useQuery } from '@tanstack/react-query';
import { api, type Enterprise, type Line, type Machine } from '@/shared/api';

export type { Enterprise, Line };

export interface EnterpriseTree {
  enterprise?: Enterprise;
  lines: Array<Line & { machines: Machine[] }>;
  machines: Machine[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useEnterpriseTree(): EnterpriseTree {
  const ents = useQuery(api.enterprises());
  const enterprise = ents.data?.[0];
  const lines = useQuery({ ...api.lines(enterprise?.id ?? ''), enabled: !!enterprise });
  const machinesQ = useQueries({ queries: (lines.data ?? []).map((l) => api.lineMachines(l.id)) });
  const withMachines = (lines.data ?? []).map((l, i) => ({ ...l, machines: machinesQ[i]?.data ?? [] }));
  return {
    enterprise,
    lines: withMachines,
    machines: withMachines.flatMap((l) => l.machines),
    isLoading: ents.isLoading || lines.isLoading || machinesQ.some((q) => q.isLoading),
    isError: ents.isError || lines.isError || machinesQ.some((q) => q.isError),
    refetch: () => {
      void ents.refetch();
      void lines.refetch();
    },
  };
}
