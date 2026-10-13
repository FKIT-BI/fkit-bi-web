import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api, type CurrentState, type Machine } from '@/shared/api';
import { useNow } from '@/shared/model';

export type { Machine, CurrentState };
export { StateBadge, StateDot } from './StateBadge';

export function useCurrentStates(enterpriseId: string | undefined | null) {
  const now = useNow();
  const q = useQuery({
    ...api.overview(enterpriseId ?? '', now),
    enabled: !!enterpriseId,
    placeholderData: (prev) => prev,
  });
  const byMachine = useMemo(
    () => new Map((q.data?.lines ?? []).flatMap((l) => l.machines).map((c) => [c.machineId, c.currentState ?? null])),
    [q.data],
  );
  return { ...q, byMachine };
}

export function useMachine(id: string) {
  return useQuery(api.machine(id));
}

export function machinePassport(m: Machine) {
  const rows: Array<{ label: string; value: string }> = [];
  const add = (label: string, value: string | number | null | undefined) => {
    if (value != null && value !== '') rows.push({ label, value: String(value) });
  };
  add('Инв. №', m.inventoryNo);
  add('Тип', m.machineType);
  add('Производитель', m.manufacturer);
  add('Модель', m.model);
  add('Год ввода', m.commissioningYear);
  if (m.nominalRate != null) add('Номинальная скорость', `${m.nominalRate.toLocaleString('ru-RU')} ${m.productionUnit ?? ''}/ч`.trim());
  for (const p of [...m.parameters].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const value =
      p.valueType === 'BOOLEAN'
        ? p.value
          ? 'да'
          : 'нет'
        : p.valueType === 'NUMBER'
          ? `${Number(p.value).toLocaleString('ru-RU')}${'unitCode' in p && p.unitCode ? ` ${p.unitCode}` : ''}`
          : p.value;
    add(p.name, value as string);
  }
  return rows;
}
