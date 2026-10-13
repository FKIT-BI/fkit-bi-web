import { dayStartMs, localDate, MINUTE } from '../../lib/time';
import { db, type MockInterval } from '../db';
import type { MockMachine } from '../fixtures';
import { noise } from './random';

export function telemetryAt(machine: MockMachine, semantic: string, t: number, intervals: MockInterval[]): number {
  const it = intervals.findLast((i) => i.from <= t);
  const running = it?.calculatedState === 'RUN';
  const n = noise(`${machine.id}:${semantic}:${Math.floor(t / MINUTE)}`);
  switch (semantic) {
    case 'SPEED':
      return running
        ? Math.round(machine.nominalRate * it!.speed * (1 + 0.04 * n))
        : Math.max(0, Math.round(machine.nominalRate * 0.01 * n));
    case 'LOAD':
      return running ? Math.round(it!.speed * 100 * (1 + 0.04 * n) * 10) / 10 : 0;
    case 'TEMPERATURE': {
      if (!it) return 20;
      if (running) return Math.round((68 + 2 * n) * 10) / 10;
      const cooled = Math.min(40, ((t - it.from) / MINUTE) * 0.8);
      return Math.round((68 - cooled + n) * 10) / 10;
    }
    case 'OUTPUT_COUNTER': {
      const tz = db.tz();
      const from = dayStartMs(localDate(t, tz), tz);
      let pcs = 0;
      for (const i of intervals) {
        if (i.calculatedState !== 'RUN') continue;
        const a = Math.max(i.from, from);
        const b = Math.min(i.to ?? t, t);
        if (b > a) pcs += ((b - a) / 3_600_000) * machine.nominalRate * i.speed;
      }
      return Math.round(pcs);
    }
    default:
      return 0;
  }
}
