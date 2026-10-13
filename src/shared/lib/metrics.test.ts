import { describe, expect, it } from 'vitest';
import { clipToWindows, computeMetrics, lossesByReason, pareto, type TimeInterval } from './metrics';

const M = 60_000;
const seq: TimeInterval[] = [
  { stateCode: 'RUN', from: 0, to: 60 * M },
  { stateCode: 'DOWN', from: 60 * M, to: 70 * M, reasonId: 'r1' },
  { stateCode: 'RUN', from: 70 * M, to: 100 * M },
  { stateCode: 'IDLE', from: 100 * M, to: 110 * M },
  { stateCode: 'PLANNED_STOP', from: 110 * M, to: 140 * M, reasonId: 'lunch' },
  { stateCode: 'RUN', from: 140 * M, to: null },
];

describe('computeMetrics', () => {
  it('считает время по категориям, остановки, A, MTBF/MTTR', () => {
    const now = 160 * M;
    const pieces = clipToWindows(seq, [{ from: 0, to: 180 * M }], now);
    const m = computeMetrics(pieces, 160 * 60, { nominalRate: 60, output: 90 });
    expect(m.runSec).toBe(110 * 60);
    expect(m.unplannedSec).toBe(20 * 60);
    expect(m.plannedSec).toBe(30 * 60);
    expect(m.offlineSec).toBe(0);
    expect(m.stops).toBe(2);
    expect(m.availability).toBeCloseTo(110 / 130);
    expect(m.performance).toBeCloseTo(90 / (60 * (110 / 60)));
    expect(m.mtbfMin).toBe(55);
    expect(m.mttrMin).toBe(5);
  });

  it('непокрытое время считается «нет данных»', () => {
    const pieces = clipToWindows(seq.slice(0, 1), [{ from: 0, to: 120 * M }], 200 * M);
    const m = computeMetrics(pieces, 120 * 60);
    expect(m.offlineSec).toBe(60 * 60);
    expect(m.availability).toBe(1);
  });

  it('окна смен обрезают интервалы', () => {
    const pieces = clipToWindows(seq, [{ from: 50 * M, to: 75 * M }], 1e9);
    expect(pieces.map((p) => [p.stateCode, p.from / M, p.to / M])).toEqual([
      ['RUN', 50, 60],
      ['DOWN', 60, 70],
      ['RUN', 70, 75],
    ]);
  });
});

describe('pareto', () => {
  it('сортирует причины и считает накопленную долю, без причины — unknown', () => {
    const pieces = clipToWindows(seq, [{ from: 0, to: 200 * M }], 150 * M);
    const rows = pareto(lossesByReason(pieces));
    expect(rows.map((r) => r.reasonId)).toEqual(['lunch', 'r1', 'unknown']);
    expect(rows.at(-1)!.cumShare).toBeCloseTo(1);
    expect(rows[0].share).toBeCloseTo(0.6);
  });
});
