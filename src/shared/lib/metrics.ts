import { isLoss, isStop, STATE_META, UNKNOWN_REASON, type StateCode } from '../config/states';
import type { Window } from './shifts';

export interface TimeInterval {
  stateCode: StateCode;
  from: number;
  to: number | null;
  reasonId?: string | null;
}

export type ClosedInterval<T extends TimeInterval = TimeInterval> = Omit<T, 'to'> & { to: number };

export interface Metrics {
  calendarSec: number;
  runSec: number;
  unplannedSec: number;
  plannedSec: number;
  offlineSec: number;
  availability: number | null;
  performance: number | null;
  output: number | null;
  stops: number;
  mtbfMin: number | null;
  mttrMin: number | null;
}

export function clipToWindows<T extends TimeInterval>(
  intervals: T[],
  windows: Window[],
  now: number,
): ClosedInterval<T>[] {
  const out: ClosedInterval<T>[] = [];
  for (const w of windows) {
    const wTo = Math.min(w.to, now);
    for (const it of intervals) {
      const to = it.to ?? now;
      const from = Math.max(it.from, w.from);
      const end = Math.min(to, wTo);
      if (end > from) out.push({ ...it, from, to: end });
    }
  }
  return out;
}

export const windowsLengthSec = (windows: Window[], now: number) =>
  windows.reduce((s, w) => s + Math.max(0, Math.min(w.to, now) - w.from), 0) / 1000;

export function computeMetrics(
  pieces: ClosedInterval[],
  calendarSec: number,
  opts: { nominalRate?: number; output?: number | null } = {},
): Metrics {
  let run = 0;
  let unplanned = 0;
  let planned = 0;
  let offline = 0;
  let down = 0;
  let stops = 0;
  let prev: ClosedInterval | undefined;
  for (const p of pieces) {
    const sec = (p.to - p.from) / 1000;
    switch (STATE_META[p.stateCode].category) {
      case 'run':
        run += sec;
        break;
      case 'unplanned':
        unplanned += sec;
        break;
      case 'planned':
        planned += sec;
        break;
      case 'offline':
        offline += sec;
        break;
    }
    if (p.stateCode === 'DOWN') down += sec;
    if (isStop(p.stateCode) && prev && prev.stateCode === 'RUN' && prev.to === p.from) stops++;
    prev = p;
  }
  const covered = run + unplanned + planned + offline;
  offline += Math.max(0, calendarSec - covered);

  const availBase = calendarSec - planned - offline;
  const output = opts.output ?? null;
  const performance =
    output != null && opts.nominalRate && run > 0 ? output / (opts.nominalRate * (run / 3600)) : null;

  return {
    calendarSec,
    runSec: run,
    unplannedSec: unplanned,
    plannedSec: planned,
    offlineSec: offline,
    availability: availBase > 0 ? run / availBase : null,
    performance,
    output,
    stops,
    mtbfMin: stops > 0 ? run / stops / 60 : null,
    mttrMin: stops > 0 ? down / stops / 60 : null,
  };
}

export function lossesByReason(pieces: ClosedInterval[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of pieces) {
    if (!isLoss(p.stateCode)) continue;
    const key = p.reasonId ?? UNKNOWN_REASON;
    m.set(key, (m.get(key) ?? 0) + (p.to - p.from) / 1000);
  }
  return m;
}

export interface ParetoRow {
  reasonId: string;
  sec: number;
  share: number;
  cumShare: number;
}

export function pareto(byReason: Map<string, number>, top?: number): ParetoRow[] {
  const total = [...byReason.values()].reduce((a, b) => a + b, 0);
  const sorted = [...byReason.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
  let cum = 0;
  return sorted.map(([reasonId, sec]) => {
    const share = total > 0 ? sec / total : 0;
    cum += share;
    return { reasonId, sec, share, cumShare: cum };
  });
}
