import { addDaysToDate, atLocal, DAY, localDate } from './time';

export interface ShiftDef {
  id: string;
  code: string;
  name: string;
  start: string;
  end: string;
}

export type ShiftFilter = 'all' | (string & {});

export interface Window {
  from: number;
  to: number;
}

export const DEFAULT_SHIFTS: ShiftDef[] = [
  { id: 'day', code: 'DAY', name: 'День', start: '08:00', end: '20:00' },
  { id: 'night', code: 'NIGHT', name: 'Ночь', start: '20:00', end: '08:00' },
];

let appShifts = DEFAULT_SHIFTS;
export const setAppShifts = (shifts: ShiftDef[]) => {
  if (shifts.length) appShifts = shifts;
};
export const getAppShifts = () => appShifts;

export function shiftBounds(shift: ShiftDef, date: string, tz: string): Window {
  const from = atLocal(date, shift.start, tz);
  let to = atLocal(date, shift.end, tz);
  if (to <= from) to = atLocal(date, shift.end, tz, 1);
  return { from, to };
}

export function shiftsInRange(from: number, to: number, tz: string, shifts: ShiftDef[] = appShifts) {
  const out: Array<{ shift: ShiftDef; date: string } & Window> = [];
  let date = localDate(from - DAY, tz);
  const last = localDate(to, tz);
  while (date <= last) {
    for (const shift of shifts) {
      const b = shiftBounds(shift, date, tz);
      if (b.to > from && b.from < to) out.push({ shift, date, ...b });
    }
    date = addDaysToDate(date, 1);
  }
  return out.sort((a, b) => a.from - b.from);
}

export function shiftWindows(
  from: number,
  to: number,
  filter: ShiftFilter | undefined,
  tz: string,
  shifts: ShiftDef[] = appShifts,
): Window[] {
  if (!filter || filter === 'all') return [{ from, to }];
  return shiftsInRange(from, to, tz, shifts)
    .filter((s) => s.shift.id === filter || s.shift.code === filter)
    .map((s) => ({ from: Math.max(s.from, from), to: Math.min(s.to, to) }));
}

export function shiftAt(ms: number, tz: string, shifts: ShiftDef[] = appShifts) {
  return shiftsInRange(ms, ms + 1, tz, shifts)[0];
}
