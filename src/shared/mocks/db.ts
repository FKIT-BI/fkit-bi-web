import type { components } from '../api/generated/analytics';
import { isLoss, type StateCode } from '../config/states';
import { addDaysToDate, DAY, dayStartMs, localDate, toIso } from '../lib/time';
import { MOCK_CONFIG } from './config';
import { registerPersisted, replaceArray, replaceMap, savePersisted } from './persist';
import { ENTERPRISE, LINES, LOSS_REASONS, MACHINES, SHIFTS, signalsOf, type MockMachine } from './fixtures';
import { generateDay, type GenInterval } from './generate/day';

type S = components['schemas'];

export interface MockIncident {
  id: string;
  machineId: string;
  from: number;
  to: number | null;
  stateOverride: S['ManualStateOverride'] | null;
  lossReasonId: string | null;
  comment: string | null;
  author: string | null;
  createdAt: number;
  updatedAt: number;
  cancelledAt: number | null;
}

export interface MockInterval {
  machineId: string;
  stateCode: StateCode;
  calculatedState: StateCode;
  stateSource: S['StateSource'];
  from: number;
  to: number | null;
  reasonId: string | null;
  stateIncidentId: string | null;
  reasonIncidentId: string | null;
  speed: number;
}

const clone = <T>(v: T): T => structuredClone(v);

const fromGen = (g: GenInterval): MockInterval => ({
  machineId: g.machineId,
  stateCode: g.stateCode,
  calculatedState: g.stateCode,
  stateSource: 'CALCULATED',
  from: g.from,
  to: g.to,
  reasonId: g.reasonId,
  stateIncidentId: null,
  reasonIncidentId: null,
  speed: g.speed,
});

function overlay(list: MockInterval[], inc: MockIncident, now: number): MockInterval[] {
  const a = inc.from;
  const b = inc.to ?? now;
  if (b <= a) return list;
  return list.flatMap((it) => {
    const itTo = it.to ?? now;
    if (itTo <= a || it.from >= b) return [it];
    const out: MockInterval[] = [];
    if (it.from < a) out.push({ ...it, to: a });
    const mid: MockInterval = { ...it, from: Math.max(it.from, a), to: itTo > b ? b : it.to };
    if (inc.stateOverride) {
      mid.stateCode = inc.stateOverride;
      mid.stateSource = 'MANUAL';
      mid.stateIncidentId = inc.id;
      if (!inc.lossReasonId) {
        mid.reasonId = null;
        mid.reasonIncidentId = null;
      }
    }
    if (inc.lossReasonId && isLoss(mid.stateCode)) {
      mid.reasonId = inc.lossReasonId;
      mid.reasonIncidentId = inc.id;
    }
    out.push(mid);
    if (itTo > b) out.push({ ...it, from: b });
    return out;
  });
}

export const db = {
  enterprises: [clone(ENTERPRISE)],
  shifts: clone(SHIFTS),
  lines: clone(LINES),
  machines: clone(MACHINES),
  reasons: clone(LOSS_REASONS),
  incidents: [] as MockIncident[],
  days: new Map<string, GenInterval[]>(),
  components: new Map<string, S['Component'][]>(),
  createdSignals: new Map<string, S['TelemetrySignal'][]>(),
  signalPatches: new Map<string, Partial<S['TelemetrySignal']>>(),
  stateConfigs: new Map<string, S['MachineStateConfiguration']>(),

  signals(m: MockMachine): S['TelemetrySignal'][] {
    return [...(m.custom ? [] : signalsOf(m)), ...(db.createdSignals.get(m.id) ?? [])].map((x) =>
      db.signalPatches.has(x.id) ? { ...x, ...db.signalPatches.get(x.id) } : x,
    );
  },

  hasStateConfig(m: MockMachine) {
    return !m.custom || db.stateConfigs.has(m.id);
  },

  tz: () => db.enterprises[0].timezone,

  historyStart(now: number) {
    const tz = db.tz();
    return dayStartMs(localDate(now - MOCK_CONFIG.historyDays * DAY, tz), tz);
  },

  persist: savePersisted,

  machine(id: string) {
    const m = db.machines.find((x) => x.id === id);
    if (m) m.coverageFrom = toIso(db.historyStart(Date.now()), db.tz());
    return m;
  },

  machinesOf(scope: S['AnalyticsScope'], id: string): MockMachine[] {
    if (scope === 'MACHINE') return db.machines.filter((m) => m.id === id);
    if (scope === 'LINE') return db.machines.filter((m) => m.lineId === id && m.status === 'ACTIVE');
    return db.machines.filter((m) => m.enterpriseId === id && m.status === 'ACTIVE');
  },

  reason(id: string | null | undefined) {
    return id ? db.reasons.find((r) => r.id === id) : undefined;
  },

  day(machine: MockMachine, date: string) {
    const key = `${machine.id}:${date}`;
    let d = db.days.get(key);
    if (!d) {
      d = generateDay(machine, date, db.tz());
      db.days.set(key, d);
    }
    return d;
  },

  intervals(machine: MockMachine, from: number, to: number, now: number): MockInterval[] {
    const tz = db.tz();
    const start = Math.max(from, db.historyStart(now));
    const end = Math.min(to, now);
    if (end <= start) return [];

    let out: MockInterval[] = [];
    const last = localDate(end - 1, tz);
    for (let date = localDate(start, tz); date <= last; date = addDaysToDate(date, 1)) {
      for (const g of db.day(machine, date)) {
        if (g.to <= start || g.from >= end) continue;
        const it = fromGen({ ...g, from: Math.max(g.from, start), to: Math.min(g.to, end) });
        const prev = out[out.length - 1];
        if (prev && prev.to === it.from && prev.stateCode === it.stateCode && prev.reasonId === it.reasonId) {
          prev.to = it.to;
        } else {
          out.push(it);
        }
      }
    }
    const tail = out[out.length - 1];
    if (tail && tail.to === now) tail.to = null;

    const incidents = db.incidents
      .filter((i) => i.machineId === machine.id && !i.cancelledAt)
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const inc of incidents) out = overlay(out, inc, now);
    return out;
  },
};

registerPersisted('core', {
  save: () => ({
    enterprises: db.enterprises,
    shifts: db.shifts,
    lines: db.lines,
    machines: db.machines,
    reasons: db.reasons,
    incidents: db.incidents,
    components: [...db.components],
    createdSignals: [...db.createdSignals],
    signalPatches: [...db.signalPatches],
    stateConfigs: [...db.stateConfigs],
  }),
  load: (v) => {
    const s = v as Record<string, unknown>;
    replaceArray(db.enterprises, s.enterprises);
    replaceArray(db.shifts, s.shifts);
    replaceArray(db.lines, s.lines);
    replaceArray(db.machines, s.machines);
    replaceArray(db.reasons, s.reasons);
    replaceArray(db.incidents, s.incidents);
    replaceMap(db.components, s.components);
    replaceMap(db.createdSignals, s.createdSignals);
    replaceMap(db.signalPatches, s.signalPatches);
    replaceMap(db.stateConfigs, s.stateConfigs);
    db.days.clear();
  },
});
