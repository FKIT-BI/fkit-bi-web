import { HOUR, dayjs } from './time';
import { getAppShifts, shiftAt, type ShiftDef } from './shifts';

export const PERIOD_PRESETS = ['shift', 'today', 'yesterday', '7d', '30d', 'custom'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export interface Period {
  from: number;
  to: number;
}

export function resolvePeriod(
  preset: PeriodPreset,
  now: number,
  tz: string,
  custom?: { from?: number; to?: number },
  shifts: ShiftDef[] = getAppShifts(),
): Period {
  const today = dayjs(now).tz(tz).startOf('day');
  switch (preset) {
    case 'shift': {
      const s = shiftAt(now, tz, shifts);
      return { from: s.from, to: s.to };
    }
    case 'today':
      return { from: today.valueOf(), to: today.add(1, 'day').valueOf() };
    case 'yesterday':
      return { from: today.subtract(1, 'day').valueOf(), to: today.valueOf() };
    case '7d':
      return { from: today.subtract(6, 'day').valueOf(), to: today.add(1, 'day').valueOf() };
    case '30d':
      return { from: today.subtract(29, 'day').valueOf(), to: today.add(1, 'day').valueOf() };
    case 'custom': {
      const from = custom?.from ?? today.valueOf();
      const to = custom?.to ?? Math.max(from + HOUR, now);
      return { from, to };
    }
  }
}

export const previousPeriod = (p: Period): Period => ({ from: 2 * p.from - p.to, to: p.from });
