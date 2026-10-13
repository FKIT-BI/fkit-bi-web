import type { components } from '../../api/generated/analytics';
import { isLoss, STATE_CODES, type StateCode } from '../../config/states';
import { clipToWindows, combineMetrics, computeMetrics, windowsLengthSec, type ClosedInterval, type Metrics } from '../../lib/metrics';
import { previousPeriod } from '../../lib/period';
import { shiftBounds, shiftWindows, type ShiftDef, type Window } from '../../lib/shifts';
import { addDaysToDate, dayStartMs, HOUR, localDate, MINUTE, toIso } from '../../lib/time';
import { db, type MockIncident, type MockInterval } from '../db';
import { signalsOf, type MockMachine } from '../fixtures';
import { telemetryAt } from '../generate/telemetry';

type S = components['schemas'];
type Scope = S['AnalyticsScope'];

const iso = (ms: number) => toIso(ms, db.tz());
const isoOrNull = (ms: number | null | undefined) => (ms == null ? null : iso(ms));

export const shiftDefs = (): ShiftDef[] =>
  db.shifts
    .filter((s) => s.status === 'ACTIVE')
    .map((s) => ({ id: s.id, code: s.code, name: s.name, start: s.startLocalTime, end: s.endLocalTime }));

export const wireMachine = ({ profile: _p, ...m }: MockMachine): S['Machine'] => m;

export const reasonSummary = (id: string | null | undefined): S['LossReasonSummary'] | null => {
  const r = db.reason(id);
  return r ? { id: r.id, code: r.code, name: r.name, category: r.category, color: r.color ?? null, status: r.status } : null;
};

export function metadata(from: number, to: number, now: number): S['HistoricalMetadata'] {
  const hs = db.historyStart(now);
  return {
    requestedFrom: iso(from),
    requestedTo: iso(to),
    actualFrom: iso(Math.max(from, hs)),
    actualTo: iso(Math.max(Math.min(to, now), Math.max(from, hs))),
    dataThrough: iso(now),
    calculatedAt: iso(now),
    partial: to > now || from < hs,
    stale: false,
    recalculating: false,
  };
}

export const currency = (now: number): S['ProjectionCurrency'] => ({
  dataThrough: iso(now),
  calculatedAt: iso(now),
  stale: false,
  recalculating: false,
});

function machinePieces(m: MockMachine, windows: Window[], now: number) {
  if (!windows.length) return [];
  return clipToWindows(db.intervals(m, windows[0].from, windows[windows.length - 1].to, now), windows, now);
}

function machineMetrics(m: MockMachine, windows: Window[], now: number): Metrics {
  const pieces = machinePieces(m, windows, now);
  let output = 0;
  let runH = 0;
  for (const p of pieces) {
    if (p.calculatedState !== 'RUN' || p.stateCode !== 'RUN') continue;
    const h = (p.to - p.from) / HOUR;
    runH += h;
    output += h * m.nominalRate * p.speed;
  }
  return computeMetrics(pieces, windowsLengthSec(windows, now), {
    output: Math.round(output),
    idealOutput: Math.round(runH * m.nominalRate),
    productionUnit: m.productionUnit ?? null,
  });
}

export function resolveRange(q: { from?: number; to?: number; shiftId?: string; shiftDate?: string }) {
  if (q.from != null && q.to != null) return { from: q.from, to: q.to, occurrence: false };
  if (q.shiftId && q.shiftDate) {
    const def = shiftDefs().find((s) => s.id === q.shiftId);
    if (!def) return null;
    return { ...shiftBounds(def, q.shiftDate, db.tz()), occurrence: true };
  }
  return null;
}

export function summary(
  scope: Scope,
  scopeId: string,
  range: { from: number; to: number; occurrence: boolean },
  shiftId: string | undefined,
  shiftDate: string | undefined,
  compare: 'NONE' | 'PREVIOUS_PERIOD',
  now: number,
): S['AnalyticsSummary'] {
  const machines = db.machinesOf(scope, scopeId);
  const period = (p: Window): S['MetricPeriod'] => {
    const windows = range.occurrence ? [p] : shiftWindows(p.from, p.to, shiftId, db.tz(), shiftDefs());
    return {
      metadata: metadata(p.from, p.to, now),
      metrics: combineMetrics(machines.map((m) => machineMetrics(m, windows, now))),
    };
  };
  const cur: Window = { from: range.from, to: range.to };
  const prev: Window = range.occurrence
    ? { from: range.from - 24 * HOUR, to: range.to - 24 * HOUR }
    : previousPeriod({ from: range.from, to: Math.min(range.to, now) });
  return {
    scope,
    scopeId,
    shiftId: shiftId ?? null,
    shiftDate: shiftDate ?? null,
    current: period(cur),
    previous: compare === 'NONE' ? null : period(prev),
  };
}

const RES_MS: Record<Exclude<S['AppliedResolution'], '1d'>, number> = { '5m': 5 * MINUTE, '15m': 15 * MINUTE, '1h': HOUR };

export function applyResolution(res: S['Resolution'] | undefined, from: number, to: number): S['AppliedResolution'] {
  if (res && res !== 'AUTO') return res;
  const span = to - from;
  if (span <= 6 * HOUR) return '5m';
  if (span <= 24 * HOUR) return '15m';
  if (span <= 4 * 24 * HOUR) return '1h';
  return '1d';
}

export function buckets(res: S['AppliedResolution'], from: number, to: number): Window[] {
  const out: Window[] = [];
  if (res === '1d') {
    const tz = db.tz();
    for (let d = localDate(from, tz); dayStartMs(d, tz) < to; d = addDaysToDate(d, 1)) {
      out.push({ from: Math.max(from, dayStartMs(d, tz)), to: Math.min(to, dayStartMs(addDaysToDate(d, 1), tz)) });
    }
    return out;
  }
  const step = RES_MS[res];
  for (let t = Math.floor(from / step) * step; t < to; t += step) out.push({ from: Math.max(t, from), to: Math.min(t + step, to) });
  return out;
}

export function metricTimeseries(scope: Scope, scopeId: string, from: number, to: number, shiftId: string | undefined, res: S['Resolution'] | undefined, now: number): S['MetricTimeseries'] {
  const applied = applyResolution(res, from, to);
  const machines = db.machinesOf(scope, scopeId);
  const end = Math.min(to, now);
  return {
    scope,
    scopeId,
    shiftId: shiftId ?? null,
    metadata: metadata(from, to, now),
    resolution: applied,
    points: buckets(applied, from, end).map((b) => {
      const windows = shiftWindows(b.from, b.to, shiftId, db.tz(), shiftDefs());
      return { bucketStart: iso(b.from), bucketEnd: iso(b.to), metrics: combineMetrics(machines.map((m) => machineMetrics(m, windows, now))) };
    }),
  };
}

function reasonDuration(reasonId: string | null, durationSec: number, kind?: S['LossBucketKind']): S['LossReasonDuration'] {
  const r = db.reason(reasonId);
  return {
    kind: kind ?? (reasonId ? 'REASON' : 'UNCLASSIFIED'),
    reasonId: kind === 'OTHER' ? null : (r?.id ?? null),
    reasonCode: kind === 'OTHER' ? null : (r?.code ?? null),
    reasonName: kind === 'OTHER' ? null : (r?.name ?? null),
    category: kind === 'OTHER' ? null : (r?.category ?? null),
    color: kind === 'OTHER' ? null : (r?.color ?? null),
    durationSec: Math.round(durationSec),
  };
}

function groupLosses(pieces: ClosedInterval<MockInterval>[]) {
  const by = new Map<string | null, number>();
  for (const p of pieces) {
    if (!isLoss(p.stateCode)) continue;
    by.set(p.reasonId, (by.get(p.reasonId) ?? 0) + (p.to - p.from) / 1000);
  }
  return by;
}

function topReasonIds(by: Map<string | null, number>, top: number) {
  return new Set(
    [...by.entries()]
      .filter(([k]) => k != null)
      .sort((a, b) => b[1] - a[1])
      .slice(0, top)
      .map(([k]) => k as string),
  );
}

function folded(by: Map<string | null, number>, keep: Set<string>): S['LossReasonDuration'][] {
  const rows: S['LossReasonDuration'][] = [];
  let other = 0;
  for (const [k, sec] of by) {
    if (k == null) rows.push(reasonDuration(null, sec, 'UNCLASSIFIED'));
    else if (keep.has(k)) rows.push(reasonDuration(k, sec));
    else other += sec;
  }
  if (other > 0) rows.push(reasonDuration(null, other, 'OTHER'));
  return rows.sort((a, b) => b.durationSec - a.durationSec);
}

export function lossTimeseries(scope: Scope, scopeId: string, from: number, to: number, shiftId: string | undefined, res: S['Resolution'] | undefined, top: number, now: number): S['LossTimeseries'] {
  const applied = applyResolution(res, from, to);
  const machines = db.machinesOf(scope, scopeId);
  const tz = db.tz();
  const all = machines.map((m) => db.intervals(m, from, to, now));
  const windowsAll = shiftWindows(from, to, shiftId, tz, shiftDefs());
  const total = groupLosses(all.flatMap((list) => clipToWindows(list, windowsAll, now)));
  const keep = topReasonIds(total, top);
  return {
    scope,
    scopeId,
    shiftId: shiftId ?? null,
    metadata: metadata(from, to, now),
    resolution: applied,
    points: buckets(applied, from, Math.min(to, now)).map((b) => {
      const windows = shiftWindows(b.from, b.to, shiftId, tz, shiftDefs());
      const pieces = all.flatMap((list) => clipToWindows(list, windows, now));
      const sum = (st: StateCode) => pieces.filter((p) => p.stateCode === st).reduce((s, p) => s + (p.to - p.from) / 1000, 0);
      const by = groupLosses(pieces);
      return {
        bucketStart: iso(b.from),
        bucketEnd: iso(b.to),
        idleSec: Math.round(sum('IDLE')),
        downSec: Math.round(sum('DOWN')),
        setupSec: Math.round(sum('SETUP')),
        plannedStopSec: Math.round(sum('PLANNED_STOP')),
        unclassifiedLossSec: Math.round(by.get(null) ?? 0),
        byReason: folded(by, keep),
      };
    }),
  };
}

export function lossPareto(scope: Scope, scopeId: string, range: { from: number; to: number; occurrence: boolean }, shiftId: string | undefined, shiftDate: string | undefined, top: number, now: number): S['LossPareto'] {
  const windows = range.occurrence ? [range] : shiftWindows(range.from, range.to, shiftId, db.tz(), shiftDefs());
  const pieces = db.machinesOf(scope, scopeId).flatMap((m) => machinePieces(m, windows, now));
  const by = groupLosses(pieces);
  const totalLossSec = [...by.values()].reduce((a, b) => a + b, 0);
  let cum = 0;
  const rows = folded(by, topReasonIds(by, top)).map((r) => {
    const share = totalLossSec > 0 ? r.durationSec / totalLossSec : 0;
    cum = Math.min(1, cum + share);
    return { ...r, share, cumulativeShare: cum };
  });
  return {
    scope,
    scopeId,
    shiftId: shiftId ?? null,
    shiftDate: shiftDate ?? null,
    metadata: metadata(range.from, range.to, now),
    totalLossSec: Math.round(totalLossSec),
    plannedStopSec: Math.round(pieces.filter((p) => p.stateCode === 'PLANNED_STOP').reduce((s, p) => s + (p.to - p.from) / 1000, 0)),
    rows,
  };
}

export function effective(it: MockInterval, from: number, to: number, now: number): S['EffectiveStateInterval'] {
  return {
    from: iso(from),
    to: iso(to),
    durationSec: Math.max(1, Math.round((to - from) / 1000)),
    openEnded: it.to == null && to >= now,
    effectiveState: it.stateCode,
    calculatedState: it.calculatedState,
    stateSource: it.stateSource,
    stateIncidentId: it.stateIncidentId,
    reasonIncidentId: it.reasonIncidentId,
    lossReason: isLoss(it.stateCode) ? reasonSummary(it.reasonId) : null,
    telemetryQuality: 'COMPLETE',
    underlyingOffline: it.calculatedState === 'OFFLINE',
  };
}

export function chronometry(m: MockMachine, shiftDate: string, shiftId: string | undefined, now: number): S['ChronometryResponse'] {
  const occurrences = shiftDefs()
    .filter((s) => !shiftId || s.id === shiftId)
    .map((s) => ({ s, ...shiftBounds(s, shiftDate, db.tz()) }))
    .filter((o) => o.from < now)
    .map(({ s, from, to }) => {
      const end = Math.min(to, now);
      const pieces = clipToWindows(db.intervals(m, from, end, now), [{ from, to: end }], now);
      const totals = STATE_CODES.map((state) => ({
        state,
        durationSec: Math.round(pieces.filter((p) => p.stateCode === state).reduce((a, p) => a + (p.to - p.from) / 1000, 0)),
      })).filter((t) => t.durationSec > 0);
      return {
        shiftId: s.id,
        shiftCode: s.code,
        shiftName: s.name,
        shiftDate,
        occurrenceFrom: iso(from),
        occurrenceTo: iso(to),
        actualTo: iso(end),
        partial: to > now,
        totals,
        intervals: pieces.map((p) => effective({ ...p, to: p.to === end && end === now ? null : p.to }, p.from, p.to, now)),
      };
    });
  return { machineId: m.id, shiftDate, occurrences, currency: currency(now) };
}

export interface IntervalFilters {
  state?: StateCode[];
  lossReasonId?: string;
  unclassifiedOnly?: boolean;
  lossOnly?: boolean;
  source?: S['StateSource'];
}

export function stateIntervals(m: MockMachine, from: number, to: number, f: IntervalFilters, cursor: string | undefined, limit: number, now: number): S['StateIntervalPage'] {
  const hs = db.historyStart(now);
  const list = db
    .intervals(m, from, to, now)
    .filter((i) => !f.state?.length || f.state.includes(i.stateCode))
    .filter((i) => !f.source || i.stateSource === f.source)
    .filter((i) => !f.lossOnly || isLoss(i.stateCode))
    .filter((i) => !f.unclassifiedOnly || (isLoss(i.stateCode) && !i.reasonId))
    .filter((i) => !f.lossReasonId || i.reasonId === f.lossReasonId);
  const offset = cursor ? Number(atob(cursor)) || 0 : 0;
  const page = list.slice(offset, offset + limit);
  const hasMore = offset + limit < list.length;
  return {
    machineId: m.id,
    requestedFrom: iso(from),
    requestedTo: iso(to),
    actualFrom: iso(Math.max(from, hs)),
    actualTo: iso(Math.min(to, now)),
    partial: to > now || from < hs,
    items: page.map((i) => effective(i, Math.max(i.from, from), Math.min(i.to ?? now, to, now), now)),
    cursor: { limit, hasMore, nextCursor: hasMore ? btoa(String(offset + limit)) : null },
    currency: currency(now),
  };
}

export function currentState(m: MockMachine, now: number): S['CurrentState'] | null {
  const list = db.intervals(m, now - 2 * 24 * HOUR, now, now);
  const last = list[list.length - 1];
  if (!last) return null;
  let since = last.from;
  for (let i = list.length - 2; i >= 0 && list[i].stateCode === last.stateCode && list[i].to === since; i--) since = list[i].from;
  return {
    effectiveState: last.stateCode,
    calculatedState: last.calculatedState,
    stateSource: last.stateSource,
    stateSince: iso(since),
    matchedRuleId: null,
    stateIncidentId: last.stateIncidentId,
    reasonIncidentId: last.reasonIncidentId,
    lossReason: isLoss(last.stateCode) ? reasonSummary(last.reasonId) : null,
    evaluationQuality: 'COMPLETE',
    lastTelemetryObservedAt: iso(now - 3000),
    underlyingOffline: last.calculatedState === 'OFFLINE',
    dataThrough: iso(now),
    calculatedAt: iso(now),
    stale: false,
    recalculating: false,
  };
}

const stateCounts = (states: Array<StateCode | undefined>): S['StateCount'][] =>
  STATE_CODES.map((state) => ({ state, count: states.filter((s) => s === state).length })).filter((c) => c.count > 0);

export function overview(enterpriseId: string, lineId: string | undefined, now: number): S['OperationsOverview'] {
  const lines = db.lines.filter((l) => l.enterpriseId === enterpriseId && l.status === 'ACTIVE' && (!lineId || l.id === lineId));
  const out = lines.map((l) => {
    const machines = db.machines.filter((m) => m.lineId === l.id && m.status === 'ACTIVE');
    const cards = machines.map((m) => {
      const cs = currentState(m, now);
      return {
        machineId: m.id,
        machineCode: m.code,
        machineName: m.name,
        machineStatus: m.status,
        inventoryNo: m.inventoryNo ?? null,
        currentState: cs,
        dataThrough: iso(now),
        calculatedAt: iso(now),
        stale: false,
        recalculating: false,
      };
    });
    return {
      lineId: l.id,
      lineCode: l.code,
      lineName: l.name,
      stateCounts: stateCounts(cards.map((c) => c.currentState?.effectiveState)),
      machines: cards,
    };
  });
  return {
    enterpriseId,
    stateCounts: stateCounts(out.flatMap((l) => l.machines.map((c) => c.currentState?.effectiveState))),
    staleMachineCount: 0,
    recalculatingMachineCount: 0,
    lines: out,
    generatedAt: iso(now),
  };
}

export function telemetryCurrent(m: MockMachine, now: number, opts: { signalId?: string[]; featuredOnly?: boolean }): S['CurrentTelemetryResponse'] {
  const intervals = db.intervals(m, now - 26 * HOUR, now, now);
  const items = signalsOf(m)
    .filter((s) => !opts.signalId?.length || opts.signalId.includes(s.id))
    .filter((s) => !opts.featuredOnly || s.featured)
    .map((s) => {
      const value = telemetryAt(m, s.semanticCode, now, intervals);
      return {
        signalId: s.id,
        componentId: null,
        code: s.code,
        name: s.name,
        valueType: s.valueType,
        signalKind: s.signalKind,
        semanticCode: s.semanticCode,
        unitCode: s.unitCode ?? null,
        featured: s.featured,
        displayOrder: s.displayOrder ?? null,
        status: s.status,
        lastReceivedValue: value,
        lastReceivedObservedAt: iso(now - 2000),
        lastReceivedAt: iso(now - 1500),
        quality: 'GOOD' as const,
        validationFlags: [],
        lastUsableValue: value,
        lastUsableObservedAt: iso(now - 2000),
        freshness: 'FRESH' as const,
        dataThrough: iso(now),
        calculatedAt: iso(now),
        stale: false,
      };
    });
  return { machineId: m.id, items, currency: currency(now), truncated: false };
}

export function telemetrySeries(m: MockMachine, signalId: string, from: number, to: number, res: S['Resolution'] | undefined, now: number): S['TelemetrySeries'] | null {
  const signal = signalsOf(m).find((s) => s.id === signalId);
  if (!signal) return null;
  const applied = applyResolution(res, from, to);
  const end = Math.min(to, now);
  const intervals = db.intervals(m, from - 26 * HOUR, end, now);
  const points = buckets(applied, from, end).map((b) => {
    const step = Math.max(MINUTE, Math.floor((b.to - b.from) / 30));
    const samples: number[] = [];
    for (let t = b.from; t < b.to; t += step) samples.push(telemetryAt(m, signal.semanticCode, t, intervals));
    const n = samples.length;
    const counts = { sampleCount: n, usableCount: n, goodCount: n, uncertainCount: 0, badCount: 0 };
    if (signal.signalKind === 'COUNTER') {
      let resets = 0;
      for (let i = 1; i < n; i++) if (samples[i] < samples[i - 1]) resets++;
      return { bucketStart: iso(b.from), bucketEnd: iso(b.to), first: samples[0] ?? null, last: samples[n - 1] ?? null, delta: n ? Math.max(0, samples[n - 1] - samples[0]) : null, resetCount: resets, ...counts };
    }
    return {
      bucketStart: iso(b.from),
      bucketEnd: iso(b.to),
      min: n ? Math.min(...samples) : null,
      max: n ? Math.max(...samples) : null,
      avg: n ? Math.round((samples.reduce((a, v) => a + v, 0) / n) * 100) / 100 : null,
      first: samples[0] ?? null,
      last: samples[n - 1] ?? null,
      ...counts,
    };
  });
  return { machineId: m.id, signal, metadata: { ...metadata(from, to, now), resolution: applied }, points };
}

export function wireIncident(i: MockIncident): S['ManualIncident'] {
  const m = db.machine(i.machineId)!;
  const line = db.lines.find((l) => l.id === m.lineId);
  return {
    id: i.id,
    machineId: i.machineId,
    machine: { id: m.id, code: m.code, name: m.name, lineId: line?.id ?? null, lineCode: line?.code ?? null, lineName: line?.name ?? null },
    from: iso(i.from),
    to: isoOrNull(i.to),
    stateOverride: i.stateOverride,
    lossReason: reasonSummary(i.lossReasonId),
    effectType: i.stateOverride ? (i.lossReasonId ? 'STATE_OVERRIDE_WITH_REASON' : 'STATE_OVERRIDE') : 'LOSS_ANNOTATION',
    comment: i.comment,
    author: i.author,
    createdAt: iso(i.createdAt),
    updatedAt: iso(i.updatedAt),
    cancelledAt: isoOrNull(i.cancelledAt),
    recalculating: false,
  };
}
