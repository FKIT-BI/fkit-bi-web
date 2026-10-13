import { MINUTE } from '../../lib/time';
import { shiftAt } from '../../lib/shifts';
import { db, type MockInterval } from '../db';
import type { MockMachine } from '../fixtures';
import { noise } from './random';

export function telemetryAt(machine: MockMachine, signal: string, t: number, intervals: MockInterval[]): number {
  const it = intervals.findLast((i) => i.from <= t);
  const running = it?.stateCode === 'RUN';
  const n = noise(`${machine.id}:${signal}:${Math.floor(t / MINUTE)}`);
  switch (signal) {
    case 'speed':
      return running ? Math.round(machine.nominalRate * it!.speed * (1 + 0.04 * n)) : Math.max(0, Math.round(machine.nominalRate * 0.01 * n));
    case 'load':
      return running ? Math.round(it!.speed * 100 * (1 + 0.04 * n) * 10) / 10 : 0;
    case 'temperature': {
      if (!it) return 20;
      if (running) return Math.round((68 + 2 * n) * 10) / 10;
      const cooled = Math.min(40, ((t - it.from) / MINUTE) * 0.8);
      return Math.round((68 - cooled + n) * 10) / 10;
    }
    case 'counter': {
      const shift = shiftAt(t, db.tz());
      let pcs = 0;
      for (const i of intervals) {
        if (i.stateCode !== 'RUN') continue;
        const from = Math.max(i.from, shift.from);
        const to = Math.min(i.to ?? t, t);
        if (to > from) pcs += ((to - from) / 3_600_000) * machine.nominalRate * i.speed;
      }
      return Math.round(pcs);
    }
    default:
      return 0;
  }
}
