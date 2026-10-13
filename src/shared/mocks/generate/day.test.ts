import { describe, expect, it } from 'vitest';
import { MACHINES } from '../fixtures';
import { generateDay } from './day';

const tz = 'Europe/Moscow';

describe('generateDay', () => {
  it('детерминирован', () => {
    expect(generateDay(MACHINES[0], '2026-09-02', tz)).toEqual(generateDay(MACHINES[0], '2026-09-02', tz));
  });

  it('покрывает сутки без дыр и перекрытий', () => {
    for (const m of MACHINES) {
      const day = generateDay(m, '2026-09-02', tz);
      expect(day[0].from).toBe(Date.parse('2026-09-02T00:00:00+03:00'));
      expect(day.at(-1)!.to).toBe(Date.parse('2026-09-03T00:00:00+03:00'));
      for (let i = 1; i < day.length; i++) expect(day[i].from).toBe(day[i - 1].to);
    }
  });

  it('профили дают разную долю RUN', () => {
    const share = (id: string) => {
      const m = MACHINES.find((x) => x.code === id)!;
      let run = 0;
      let total = 0;
      for (let d = 1; d <= 28; d++) {
        for (const it of generateDay(m, `2026-08-${String(d).padStart(2, '0')}`, tz)) {
          total += it.to - it.from;
          if (it.stateCode === 'RUN') run += it.to - it.from;
        }
      }
      return run / total;
    };
    const stable = share('EXTRUDER_1');
    const problem = share('EXTRUDER_2');
    console.log({ stable, average: share('WINDER_1'), problem });
    expect(stable).toBeGreaterThan(0.78);
    expect(problem).toBeLessThan(0.65);
  });
});
