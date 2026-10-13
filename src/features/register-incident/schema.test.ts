import { describe, expect, it } from 'vitest';
import { parseLocal, toLocalString } from '@/shared/lib';
import { incidentFormSchema } from './schema';

const base = { machineId: 'm', ongoing: false, reasonId: '', stateOverride: 'SETUP' as const, comment: '' };
const paths = (r: ReturnType<ReturnType<typeof incidentFormSchema>['safeParse']>) => (r.success ? [] : r.error.issues.map((i) => `${String(i.path[0])}:${i.message}`));

describe('правила инцидента (зеркало Analytics)', () => {
  const coverage = Date.UTC(2026, 9, 13, 20, 9, 5, 335);

  it('сравнивает начало с началом данных машины до миллисекунды', () => {
    const from = toLocalString(coverage); // the picker string drops 335 ms
    const to = toLocalString(coverage + 60_000);
    expect(paths(incidentFormSchema({ coverageFrom: coverage }).safeParse({ ...base, from, to }))).toContain('from:incident.errBeforeCoverage');
    const exactMs = (field: 'from' | 'to', value: string) => (field === 'from' && value === from ? coverage : parseLocal(value));
    expect(paths(incidentFormSchema({ coverageFrom: coverage, exactMs }).safeParse({ ...base, from, to })).filter((p) => p.startsWith('from'))).toEqual([]);
  });

  it('окончание позже начала и не в будущем; продолжающийся без окончания', () => {
    const now = Date.now();
    const s = incidentFormSchema();
    expect(paths(s.safeParse({ ...base, from: toLocalString(now - 60_000), to: toLocalString(now - 120_000) }))).toContain('to:incident.errToBeforeFrom');
    expect(paths(s.safeParse({ ...base, from: toLocalString(now - 60_000), to: toLocalString(now + 120_000) }))).toContain('to:incident.errFuture');
    expect(s.safeParse({ ...base, from: toLocalString(now - 60_000), to: null, ongoing: true }).success).toBe(true);
  });

  it('требует ручное состояние или причину', () => {
    const now = Date.now();
    const r = incidentFormSchema().safeParse({ ...base, stateOverride: '', from: toLocalString(now - 60_000), to: null, ongoing: true });
    expect(paths(r)).toContain('reasonId:incident.errReasonOrState');
  });
});
