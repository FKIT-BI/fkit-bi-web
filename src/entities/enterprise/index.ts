import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api, type Enterprise, type EquipmentTreeMachine } from '@/shared/api';
import type { ShiftDef } from '@/shared/lib';

export type { Enterprise };

export type TreeMachine = EquipmentTreeMachine & { lineId: string | null };
export interface TreeLine {
  id: string;
  code: string;
  name: string;
  machines: TreeMachine[];
}

export function useEnterpriseTree() {
  const ents = useQuery(api.enterprises());
  const enterprise = ents.data?.items[0];
  const id = enterprise?.id ?? '';
  const tree = useQuery({ ...api.equipmentTree(id), enabled: !!id });
  const shiftsQ = useQuery({ ...api.shifts(id), enabled: !!id });

  const derived = useMemo(() => {
    const lines: TreeLine[] = (tree.data?.lines ?? []).map((l) => ({
      id: l.id,
      code: l.code,
      name: l.name,
      machines: l.machines.map((m) => ({ ...m, lineId: l.id })),
    }));
    const unassigned = (tree.data?.unassignedMachines ?? []).map((m) => ({ ...m, lineId: null }));
    const shifts: ShiftDef[] = (shiftsQ.data?.items ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({ id: s.id, code: s.code, name: s.name, start: s.startLocalTime, end: s.endLocalTime }));
    return { lines, machines: [...lines.flatMap((l) => l.machines), ...unassigned], shifts };
  }, [tree.data, shiftsQ.data]);

  return {
    enterprise,
    timezone: tree.data?.enterprise.timezone ?? enterprise?.timezone,
    ...derived,
    isLoading: ents.isLoading || tree.isLoading || shiftsQ.isLoading,
    isReady: !!enterprise && !!tree.data && !!shiftsQ.data,
    isError: ents.isError || tree.isError || shiftsQ.isError,
    error: ents.error ?? tree.error ?? shiftsQ.error,
    refetch: () => {
      void ents.refetch();
      void tree.refetch();
      void shiftsQ.refetch();
    },
  };
}
