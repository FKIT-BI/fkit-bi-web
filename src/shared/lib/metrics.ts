import type { components } from '../api/generated/analytics';
import { isLoss, type StateCode } from '../config/states';
import type { Window } from './shifts';

export type Metrics = components['schemas']['Metrics'];

export interface TimeInterval {
  stateCode: StateCode;
  from: number;
  to: number | null;
  reasonId?: string | null;
}

export type ClosedInterval<T extends TimeInterval = TimeInterval> = Omit<T, 'to'> & { to: number };

export function clipToWindows<T extends TimeInterval>(intervals: T[], windows: Window[], now: number): ClosedInterval<T>[] {
  const out: ClosedInterval<T>[] = [];
  for (const w of windows) {
    const wTo = Math.min(w.to, now);
    for (const it of intervals) {
      const from = Math.max(it.from, w.from);
      const end = Math.min(it.to ?? now, wTo);
      if (end > from) out.push({ ...it, from, to: end });
    }
  }
  return out;
}

export const windowsLengthSec = (windows: Window[], now: number) =>
  windows.reduce((s, w) => s + Math.max(0, Math.min(w.to, now) - w.from), 0) / 1000;

export interface MetricInputs {
  output?: number | null;
  idealOutput?: number | null;
  productionUnit?: string | null;
}

export function computeMetrics(pieces: ClosedInterval[], calendarSec: number, inputs: MetricInputs = {}): Metrics {
  const sec: Record<StateCode, number> = { RUN: 0, IDLE: 0, DOWN: 0, SETUP: 0, PLANNED_STOP: 0, OFFLINE: 0 };
  let stops = 0;
  let failures = 0;
  let recoveries = 0;
  let prev: ClosedInterval | undefined;
  for (const p of pieces) {
    sec[p.stateCode] += (p.to - p.from) / 1000;
    const contiguous = prev && prev.to === p.from;
    if (contiguous && prev!.stateCode === 'RUN' && (p.stateCode === 'IDLE' || p.stateCode === 'DOWN')) stops++;
    if (contiguous && prev!.stateCode !== 'DOWN' && p.stateCode === 'DOWN') failures++;
    if (contiguous && prev!.stateCode === 'DOWN' && p.stateCode === 'RUN') recoveries++;
    prev = p;
  }
  const covered = Object.values(sec).reduce((a, b) => a + b, 0);
  const offline = sec.OFFLINE + Math.max(0, calendarSec - covered);
  const plannedProduction = Math.max(0, calendarSec - sec.SETUP - sec.PLANNED_STOP - offline);
  const output = inputs.output ?? null;
  const ideal = inputs.idealOutput ?? null;
  const performance = output != null && ideal ? output / ideal : null;
  const codes: Metrics['diagnostics']['codes'] = ['SCRAP_SIGNAL_MISSING'];
  if (offline > 0) codes.push('PARTIAL_COVERAGE');
  if (output == null) codes.push('OUTPUT_SIGNAL_MISSING');

  return {
    coveredSec: calendarSec,
    runSec: sec.RUN,
    idleSec: sec.IDLE,
    downSec: sec.DOWN,
    setupSec: sec.SETUP,
    plannedStopSec: sec.PLANNED_STOP,
    effectiveOfflineSec: offline,
    underlyingOfflineSec: offline,
    plannedProductionSec: plannedProduction,
    operatingSec: sec.RUN,
    productiveSec: performance != null ? sec.RUN * performance : sec.RUN,
    output,
    scrap: null,
    goodOutput: null,
    idealOutput: ideal,
    productionUnit: inputs.productionUnit ?? null,
    stopCount: stops,
    failureCount: failures,
    recoveryCount: recoveries,
    availability: plannedProduction > 0 ? sec.RUN / plannedProduction : null,
    performance,
    quality: null,
    oee: null,
    dataCoverage: calendarSec > 0 ? (calendarSec - offline) / calendarSec : null,
    mtbfSec: failures > 0 ? sec.RUN / failures : null,
    mttrSec: failures > 0 ? sec.DOWN / failures : null,
    diagnostics: { codes },
  };
}

const SUMMABLE = [
  'coveredSec', 'runSec', 'idleSec', 'downSec', 'setupSec', 'plannedStopSec', 'effectiveOfflineSec',
  'underlyingOfflineSec', 'plannedProductionSec', 'operatingSec', 'productiveSec', 'stopCount', 'failureCount', 'recoveryCount',
] as const;

export function combineMetrics(list: Metrics[]): Metrics {
  if (list.length === 1) return list[0];
  const r = Object.fromEntries(SUMMABLE.map((k) => [k, list.reduce((s, m) => s + (m[k] ?? 0), 0)])) as Pick<Metrics, (typeof SUMMABLE)[number]>;
  const sumNullable = (k: 'output' | 'idealOutput') =>
    list.some((m) => m[k] != null) ? list.reduce((s, m) => s + (m[k] ?? 0), 0) : null;
  const output = sumNullable('output');
  const ideal = sumNullable('idealOutput');
  const prod = r.plannedProductionSec ?? 0;
  return {
    ...r,
    output,
    scrap: null,
    goodOutput: null,
    idealOutput: ideal,
    productionUnit: list[0]?.productionUnit ?? null,
    availability: prod > 0 ? r.runSec / prod : null,
    performance: output != null && ideal ? output / ideal : null,
    quality: null,
    oee: null,
    dataCoverage: r.coveredSec > 0 ? (r.coveredSec - r.effectiveOfflineSec) / r.coveredSec : null,
    mtbfSec: r.failureCount > 0 ? r.runSec / r.failureCount : null,
    mttrSec: r.failureCount > 0 ? r.downSec / r.failureCount : null,
    diagnostics: { codes: [...new Set(list.flatMap((m) => m.diagnostics.codes))] },
  };
}

export function lossesByReason(pieces: ClosedInterval[]): Map<string | null, number> {
  const m = new Map<string | null, number>();
  for (const p of pieces) {
    if (!isLoss(p.stateCode)) continue;
    const key = p.reasonId ?? null;
    m.set(key, (m.get(key) ?? 0) + (p.to - p.from) / 1000);
  }
  return m;
}

export const runShare = (m: Metrics) => (m.coveredSec > 0 ? m.runSec / m.coveredSec : null);
export const unplannedSec = (m: Metrics) => m.idleSec + m.downSec;
export const plannedSec = (m: Metrics) => m.setupSec + m.plannedStopSec;
