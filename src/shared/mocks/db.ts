import { isStop } from '../config/states';
import { addDaysToDate, DAY, dayStartMs, localDate } from '../lib/time';
import { MOCK_CONFIG } from './config';
import { ENTERPRISE, LINES, LOSS_REASONS, MACHINES, type MockMachine } from './fixtures';
import { generateDay, type GenInterval } from './generate/day';

export interface MockIncident {
  id: string;
  machineId: string;
  from: number;
  to: number | null;
  reasonId: string;
  comment: string;
  author: string;
  createdAt: number;
}

export interface MockInterval extends Omit<GenInterval, 'to'> {
  to: number | null;
  incident?: { id: string; comment: string; author: string } | null;
}

const clone = <T>(v: T): T => structuredClone(v);

function loadIncidents(): MockIncident[] {
  try {
    const raw = localStorage.getItem(MOCK_CONFIG.persistKey);
    return raw ? (JSON.parse(raw).incidents ?? []) : [];
  } catch {
    return [];
  }
}

export const db = {
  enterprises: [clone(ENTERPRISE)],
  lines: clone(LINES),
  machines: clone(MACHINES) as MockMachine[],
  reasons: clone(LOSS_REASONS),
  incidents: loadIncidents(),
  days: new Map<string, GenInterval[]>(),

  tz: () => db.enterprises[0].timezone,

  persist() {
    try {
      localStorage.setItem(MOCK_CONFIG.persistKey, JSON.stringify({ incidents: db.incidents }));
    } catch {
    }
  },

  machine(id: string) {
    return db.machines.find((m) => m.id === id);
  },

  machinesOf(scope: 'enterprise' | 'line' | 'machine', id: string): MockMachine[] {
    if (scope === 'machine') return db.machines.filter((m) => m.id === id);
    if (scope === 'line') return db.machines.filter((m) => m.lineId === id && !m.archived);
    const lineIds = new Set(db.lines.filter((l) => l.enterpriseId === id).map((l) => l.id));
    return db.machines.filter((m) => lineIds.has(m.lineId) && !m.archived);
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
    const historyStart = dayStartMs(localDate(now - MOCK_CONFIG.historyDays * DAY, tz), tz);
    const start = Math.max(from, historyStart);
    const end = Math.min(to, now);
    if (end <= start) return [];

    const out: MockInterval[] = [];
    const last = localDate(end - 1, tz);
    for (let date = localDate(start, tz); date <= last; date = addDaysToDate(date, 1)) {
      for (const it of db.day(machine, date)) {
        if (it.to <= start || it.from >= end) continue;
        const clipped: MockInterval = { ...it, from: Math.max(it.from, start), to: it.to > end ? end : it.to };
        const prev = out[out.length - 1];
        if (prev && prev.to === clipped.from && prev.stateCode === clipped.stateCode && prev.reasonId === clipped.reasonId) {
          prev.to = clipped.to;
        } else {
          out.push(clipped);
        }
      }
    }
    const tail = out[out.length - 1];
    if (tail && tail.to === now) tail.to = null;

    const incidents = db.incidents.filter((i) => i.machineId === machine.id);
    if (incidents.length) {
      for (const it of out) {
        if (!isStop(it.stateCode)) continue;
        const itTo = it.to ?? now;
        const inc = incidents.find((i) => i.from < itTo && (i.to ?? now) > it.from);
        if (inc) {
          it.reasonId = inc.reasonId;
          it.incident = { id: inc.id, comment: inc.comment, author: inc.author };
        }
      }
    }
    return out;
  },
};
