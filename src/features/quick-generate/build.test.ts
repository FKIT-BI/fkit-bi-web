import { describe, expect, it } from 'vitest';
import { buildScenario, leaves, pick, type MachineInput } from './build';

const sig = (id: string, code: string, extra: Partial<MachineInput['signals'][number]> = {}) => ({ id, code, name: code, valueType: 'DOUBLE', signalKind: 'GAUGE', ...extra });
const machine: MachineInput = {
  machine: { id: 'm1', name: 'Пресс', nominalRate: 3600 },
  signals: [sig('speed', 'SPEED', { validMin: 0, validMax: 200 }), sig('temp', 'TEMP', { validMin: 0, validMax: 150 }), sig('cnt', 'COUNT', { signalKind: 'COUNTER', valueType: 'LONG' }), sig('flag', 'FLAG', { signalKind: 'STATE', valueType: 'BOOLEAN' })],
  config: {
    defaultState: 'IDLE',
    rules: [
      { priority: 10, targetState: 'DOWN', activationDelayMs: 30_000, enterCondition: { type: 'COMPARE', signalId: 'temp', operator: 'GTE', value: 90 } },
      { priority: 5, targetState: 'RUN', activationDelayMs: 10_000, enterCondition: { type: 'ALL', conditions: [{ type: 'COMPARE', signalId: 'speed', operator: 'GT', value: 10 }, { type: 'COMPARE', signalId: 'temp', operator: 'LT', value: 80 }] } },
    ],
  },
};

describe('сценарий из правил состояний', () => {
  it('значения подбираются так, чтобы условия выполнялись/не выполнялись', () => {
    const gt = { type: 'COMPARE', signalId: 's', operator: 'GT', value: 10 } as const;
    expect(pick(gt, true).value).toBeGreaterThan(10 + 3 * pick(gt, true).sd);
    expect(pick(gt, false).value).toBeLessThanOrEqual(10);
    const between = { type: 'COMPARE', signalId: 's', operator: 'BETWEEN', lower: 5, upper: 15 } as const;
    expect(pick(between, true).value).toBe(10);
    expect(pick(between, false).value).toBeGreaterThan(15);
    expect(pick({ type: 'COMPARE', signalId: 's', operator: 'EQ', value: 'AUTO' }, false).value).not.toBe('AUTO');
    expect(leaves({ type: 'NOT', condition: gt })).toEqual([]);
  });

  it('база соответствует рабочему правилу, фазы — состояниям', () => {
    const b = buildScenario([machine], { profile: 'typical', intervalMs: 5000 });
    const base = Object.fromEntries(b.machineTargets[0].baseBehaviors.map((x) => [x.signalId, x.behavior as unknown as Record<string, number | string>]));
    expect(base.speed.model).toBe('NORMAL');
    expect(base.speed.mean).toBeGreaterThan(10);
    expect(base.temp.mean).toBeLessThan(80);
    expect(base.cnt.model).toBe('COUNTER_RATE');
    expect(base.cnt.incrementPerSecond).toBe(1);
    expect(base.flag).toBeUndefined();

    expect(b.phases.map((p) => p.code)).toEqual(['RUN', 'IDLE', 'DOWN']);
    const down = b.phases.find((p) => p.code === 'DOWN')!;
    expect(down.behaviorOverrides).toHaveLength(1);
    expect((down.behaviorOverrides[0] as unknown as { behavior: Record<string, number> }).behavior.mean).toBeGreaterThan(90);
    // IDLE — состояние по умолчанию: рабочее правило должно перестать выполняться
    const idle = b.phases.find((p) => p.code === 'IDLE')!;
    expect(idle.behaviorOverrides.map((o) => o.signalId).sort()).toEqual(['speed', 'temp']);
    expect(down.durationMs).toBeGreaterThanOrEqual(30_000 * 2 + 90_000);
  });

  it('профиль меняет доли фаз, а машины без правил попадают в замечания', () => {
    const stable = buildScenario([machine], { profile: 'stable', intervalMs: 5000 });
    const problem = buildScenario([machine], { profile: 'problem', intervalMs: 5000 });
    const share = (b: typeof stable) => b.phases[0].durationMs / b.phases.reduce((a, p) => a + p.durationMs, 0);
    expect(share(stable)).toBeGreaterThan(share(problem));
    const bare = buildScenario([{ machine: { id: 'm2', name: 'Голая' }, signals: [], config: null }], { profile: 'typical', intervalMs: 5000 });
    expect(bare.notes).toHaveLength(2);
    expect(bare.phases.map((p) => p.code)).toEqual(['RUN']);
  });
});
