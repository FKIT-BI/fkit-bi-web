import { useMemo } from 'react';
import type { RangeParams } from '@/shared/api';
import { getAppShifts, getAppTimezone, resolvePeriod, type PeriodPreset } from '@/shared/lib';
import { useDashboardSearch, useNow } from '@/shared/model';

const parse = (s?: string) => (s ? Date.parse(s) : undefined);

export function usePeriod() {
  const [search] = useDashboardSearch();
  const now = useNow();
  const preset: PeriodPreset = search.range ?? (search.from ? 'custom' : 'today');
  const shiftCode = search.shift;
  return useMemo(() => {
    const p = resolvePeriod(preset, now, getAppTimezone(), { from: parse(search.from), to: parse(search.to) });
    const live = p.to > now;
    const shift = shiftCode ? getAppShifts().find((s) => s.code === shiftCode) : undefined;
    const params: RangeParams = { from: p.from, to: p.to, ...(shift ? { shiftId: shift.id } : {}), ...(live ? { asOf: now } : {}) };
    return { preset, shiftId: shift?.id, shiftCode: shift?.code, now, live, from: p.from, to: p.to, params };
  }, [preset, now, shiftCode, search.from, search.to]);
}

export type PeriodState = ReturnType<typeof usePeriod>;
