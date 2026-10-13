import { describe, expect, it } from 'vitest';
import { suggestRules } from './suggestRules';

const s = (id: string, semanticCode: string, extra: Record<string, unknown> = {}) => ({ id, code: id.toUpperCase(), name: id, valueType: 'DOUBLE', signalKind: 'GAUGE', semanticCode, validMin: null, validMax: null, status: 'ACTIVE', ...extra }) as never;

describe('черновик правил состояний', () => {
  it('аварии и перегрев приоритетнее работы; порог считается от допустимого диапазона', () => {
    const { config, notes } = suggestRules([
      s('speed', 'ROTATIONAL_SPEED', { validMax: 1000 }),
      s('temp', 'TEMPERATURE', { validMax: 120 }),
      s('alarm', 'ALARM_FLAG', { valueType: 'BOOLEAN', signalKind: 'STATE' }),
    ]);
    expect(notes).toEqual([]);
    expect(config.defaultState).toBe('IDLE');
    expect(config.rules.map((r) => [r.name, r.targetState, r.priority])).toEqual([
      ['Авария по флагу', 'DOWN', 100],
      ['Перегрев', 'DOWN', 90],
      ['Работа: speed', 'RUN', 50],
    ]);
    expect((config.rules[1].enterCondition as unknown as { value: number }).value).toBe(108);
    expect((config.rules[2].enterCondition as unknown as { value: number }).value).toBe(50);
    expect(new Set(config.rules.map((r) => r.priority)).size).toBe(3);
  });

  it('флаг работы заменяет скорость; без подходящих сигналов — понятные замечания', () => {
    const withFlag = suggestRules([s('run', 'OPERATING_FLAG', { valueType: 'BOOLEAN', signalKind: 'STATE' }), s('speed', 'SPEED')]);
    expect(withFlag.config.rules).toHaveLength(1);
    expect(withFlag.config.rules[0].name).toBe('Работа по флагу');
    const none = suggestRules([s('cnt', 'PRODUCTION_COUNT', { signalKind: 'COUNTER', valueType: 'LONG' }), s('off', 'SPEED', { status: 'DISABLED' })]);
    expect(none.config.rules).toEqual([]);
    expect(none.notes.length).toBeGreaterThan(0);
  });
});
