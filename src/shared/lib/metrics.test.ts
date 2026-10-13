import { describe, expect, it } from 'vitest';
import { clipToWindows, combineMetrics, computeMetrics, lossesByReason, type TimeInterval } from './metrics';

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
  it('считает время по состояниям, остановки, A, P, MTBF/MTTR', () => {
    const pieces = clipToWindows(seq, [{ from: 0, to: 180 * M }], 160 * M);
    const m = computeMetrics(pieces, 160 * 60, { output: 90, idealOutput: 110 });
    expect(m.runSec).toBe(110 * 60);
    expect(m.idleSec + m.downSec).toBe(20 * 60);
    expect(m.plannedStopSec).toBe(30 * 60);
    expect(m.effectiveOfflineSec).toBe(0);
    expect(m.stopCount).toBe(2);
    expect(m.failureCount).toBe(1);
    expect(m.recoveryCount).toBe(1);
    expect(m.availability).toBeCloseTo(110 / 130);
    expect(m.performance).toBeCloseTo(90 / 110);
    expect(m.mtbfSec).toBe(110 * 60);
    expect(m.mttrSec).toBe(10 * 60);
  });

  it('непокрытое время — нет данных', () => {
    const pieces = clipToWindows(seq.slice(0, 1), [{ from: 0, to: 120 * M }], 200 * M);
    const m = computeMetrics(pieces, 120 * 60);
    expect(m.effectiveOfflineSec).toBe(60 * 60);
    expect(m.availability).toBe(1);
    expect(m.dataCoverage).toBe(0.5);
  });

  it('окна смен обрезают интервалы', () => {
    const pieces = clipToWindows(seq, [{ from: 50 * M, to: 75 * M }], 1e9);
    expect(pieces.map((p) => [p.stateCode, p.from / M, p.to / M])).toEqual([
      ['RUN', 50, 60],
      ['DOWN', 60, 70],
      ['RUN', 70, 75],
    ]);
  });

  it('агрегат по машинам пересчитывает отношения из сумм', () => {
    const a = computeMetrics(clipToWindows(seq, [{ from: 0, to: 140 * M }], 1e9), 140 * 60, { output: 50, idealOutput: 100 });
    const b = computeMetrics(clipToWindows(seq.slice(0, 1), [{ from: 0, to: 60 * M }], 1e9), 60 * 60, { output: 60, idealOutput: 60 });
    const c = combineMetrics([a, b]);
    expect(c.runSec).toBe(a.runSec + b.runSec);
    expect(c.performance).toBeCloseTo(110 / 160);
  });
});

describe('lossesByReason', () => {
  it('группирует потери, без причины — null', () => {
    const pieces = clipToWindows(seq, [{ from: 0, to: 200 * M }], 150 * M);
    const m = lossesByReason(pieces);
    expect(m.get('lunch')).toBe(30 * 60);
    expect(m.get('r1')).toBe(10 * 60);
    expect(m.get(null)).toBe(10 * 60);
  });
});
