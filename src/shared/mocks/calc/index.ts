import { isLoss, UNKNOWN_REASON } from '../../config/states';
import {
  clipToWindows,
  computeMetrics,
  lossesByReason,
  pareto,
  windowsLengthSec,
  type ClosedInterval,
  type Metrics,
} from '../../lib/metrics';
import { previousPeriod, type Bucket } from '../../lib/period';
import { shiftBounds, shiftsInRange, shiftWindows, type ShiftFilter, type Window } from '../../lib/shifts';
import { addDaysToDate, dayStartMs, HOUR, localDate, toIso } from '../../lib/time';
import { db, type MockInterval } from '../db';
import type { MockMachine } from '../fixtures';

type Scope = 'enterprise' | 'line' | 'machine';

const iso = (ms: number) => toIso(ms, db.tz());

function outputOf(pieces: ClosedInterval<MockInterval>[], m: MockMachine) {
  return pieces.reduce(
    (s, p) => (p.stateCode === 'RUN' ? s + ((p.to - p.from) / 3_600_000) * m.nominalRate * p.speed : s),
    0,
  );
}

function machineMetrics(m: MockMachine, windows: Window[], now: number): Metrics {
  const from = windows[0]?.from ?? now;
  const to = windows[windows.length - 1]?.to ?? now;
  const pieces = clipToWindows(db.intervals(m, from, to, now), windows, now);
  return computeMetrics(pieces, windowsLengthSec(windows, now), {
    nominalRate: m.nominalRate,
    output: Math.round(outputOf(pieces, m)),
  });
}

function combine(list: Array<{ m: MockMachine; x: Metrics }>): Metrics {
  const sum = (k: keyof Metrics) => list.reduce((s, { x }) => s + ((x[k] as number) ?? 0), 0);
  const calendarSec = sum('calendarSec');
  const runSec = sum('runSec');
  const plannedSec = sum('plannedSec');
  const offlineSec = sum('offlineSec');
  const stops = sum('stops');
  const output = sum('output');
  const nominalRun = list.reduce((s, { m, x }) => s + m.nominalRate * (x.runSec / 3600), 0);
  const downSec = list.reduce((s, { x }) => s + (x.mttrMin ?? 0) * 60 * x.stops, 0);
  const base = calendarSec - plannedSec - offlineSec;
  return {
    calendarSec,
    runSec,
    unplannedSec: sum('unplannedSec'),
    plannedSec,
    offlineSec,
    availability: base > 0 ? runSec / base : null,
    performance: nominalRun > 0 ? output / nominalRun : null,
    output,
    stops,
    mtbfMin: stops > 0 ? runSec / stops / 60 : null,
    mttrMin: stops > 0 ? downSec / stops / 60 : null,
  };
}

export function currentState(m: MockMachine, now: number) {
  const list = db.intervals(m, now - 2 * 24 * HOUR, now, now);
  const last = list[list.length - 1];
  if (!last) return { machineId: m.id, stateCode: 'OFFLINE' as const, since: iso(now), reasonId: null };
  let since = last.from;
  for (let i = list.length - 2; i >= 0 && list[i].stateCode === last.stateCode && list[i].to === since; i--) {
    since = list[i].from;
  }
  return { machineId: m.id, stateCode: last.stateCode, since: iso(since), reasonId: last.reasonId };
}

export function summary(scope: Scope, id: string, from: number, to: number, shift: ShiftFilter, now: number) {
  const machines = db.machinesOf(scope, id);
  const tz = db.tz();
  const calc = (p: { from: number; to: number }) => {
    const windows = shiftWindows(p.from, p.to, shift, tz);
    const list = machines.map((m) => ({ m, x: machineMetrics(m, windows, now) }));
    return list.length === 1 ? list[0].x : combine(list);
  };
  const prev = previousPeriod({ from, to: Math.min(to, now) });
  const res: Record<string, unknown> = {
    scope,
    id,
    from: iso(from),
    to: iso(to),
    current: calc({ from, to }),
    previous: calc(prev),
  };
  if (scope !== 'machine') {
    const statesNow: Record<string, number> = {};
    for (const m of machines) {
      const s = currentState(m, now).stateCode;
      statesNow[s] = (statesNow[s] ?? 0) + 1;
    }
    res.statesNow = statesNow;
  }
  return res;
}

function bucketsOf(bucket: Bucket, from: number, to: number, now: number): Window[] {
  const tz = db.tz();
  const end = Math.min(to, now);
  if (bucket === 'shift') return shiftsInRange(from, end, tz).map(({ from: f, to: t }) => ({ from: f, to: t }));
  const out: Window[] = [];
  if (bucket === 'hour') {
    for (let t = from; t < end; t += HOUR) out.push({ from: t, to: t + HOUR });
  } else {
    for (let d = localDate(from, tz); dayStartMs(d, tz) < end; d = addDaysToDate(d, 1)) {
      out.push({ from: dayStartMs(d, tz), to: dayStartMs(addDaysToDate(d, 1), tz) });
    }
  }
  return out;
}

function lossPieces(scope: Scope, id: string, windows: Window[], now: number) {
  const from = windows[0]?.from ?? now;
  const to = windows[windows.length - 1]?.to ?? now;
  return db.machinesOf(scope, id).flatMap((m) => clipToWindows(db.intervals(m, from, to, now), windows, now));
}

export function lossesTimeseries(
  scope: Scope,
  id: string,
  from: number,
  to: number,
  shift: ShiftFilter,
  bucket: Bucket,
  now: number,
) {
  const tz = db.tz();
  const machines = db.machinesOf(scope, id);
  const all = new Map(machines.map((m) => [m.id, db.intervals(m, from, to, now)]));
  return bucketsOf(bucket, from, to, now).map((b) => {
    const windows = shiftWindows(Math.max(b.from, from), Math.min(b.to, to), shift, tz);
    const pieces = machines.flatMap((m) => clipToWindows(all.get(m.id)!, windows, now));
    const byReason = Object.fromEntries(
      [...lossesByReason(pieces)].map(([k, v]) => [k, Math.round(v)]),
    );
    return { bucketStart: iso(b.from), bucketEnd: iso(b.to), byReason };
  });
}

export function lossesPareto(
  scope: Scope,
  id: string,
  from: number,
  to: number,
  shift: ShiftFilter,
  top: number | undefined,
  now: number,
) {
  const pieces = lossPieces(scope, id, shiftWindows(from, to, shift, db.tz()), now);
  return pareto(lossesByReason(pieces), top).map((r) => ({ ...r, sec: Math.round(r.sec) }));
}

export function chronometry(machine: MockMachine, date: string, shift: 'day' | 'night', top: number, now: number) {
  const def = db.enterprises[0].shiftSchedule.find((s) => s.id === shift)!;
  const b = shiftBounds(def, date, db.tz());
  const pieces = clipToWindows(db.intervals(machine, b.from, b.to, now), [b], now);
  const wire = (p: ClosedInterval<MockInterval>) => ({
    stateCode: p.stateCode,
    from: iso(p.from),
    to: iso(p.to),
    reasonId: p.reasonId,
    incident: p.incident ?? null,
  });
  const groups = new Map<string, ClosedInterval<MockInterval>[]>();
  for (const p of pieces) {
    if (!isLoss(p.stateCode)) continue;
    const key = p.reasonId ?? UNKNOWN_REASON;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const reasons = [...groups.entries()]
    .map(([reasonId, list]) => ({
      reasonId,
      totalSec: Math.round(list.reduce((s, p) => s + (p.to - p.from) / 1000, 0)),
      intervals: list.map(wire),
    }))
    .sort((a, b2) => b2.totalSec - a.totalSec)
    .slice(0, top);
  return { shiftStart: iso(b.from), shiftEnd: iso(b.to), states: pieces.map(wire), reasons };
}
