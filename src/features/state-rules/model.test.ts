import { describe, expect, it } from 'vitest';
import { answersToRules, defaultCompare, describeConfig, flatten, localIssues, ruleIndexOf, rulesToAnswers, suggestAnswers, unflatten, withPriorities, type RuleSignal } from './model';

const sig = (id: string, p: Partial<RuleSignal>): RuleSignal => ({ id, name: id, valueType: 'DOUBLE', signalKind: 'GAUGE', semanticCode: 'CUSTOM', unitCode: null, validMax: null, status: 'ACTIVE', ...p });

const run = sig('run', { name: 'Машина в работе', valueType: 'BOOLEAN', signalKind: 'STATE', semanticCode: 'OPERATING_FLAG' });
const alarm = sig('alarm', { name: 'Авария', valueType: 'BOOLEAN', signalKind: 'STATE', semanticCode: 'ALARM_FLAG' });
const speed = sig('speed', { name: 'Скорость', semanticCode: 'LINEAR_SPEED', validMax: 100 });
const temp = sig('temp', { name: 'Температура', semanticCode: 'TEMPERATURE', unitCode: 'CELSIUS', validMax: 200 });
const count = sig('count', { name: 'Выпуск', valueType: 'LONG', signalKind: 'COUNTER', semanticCode: 'PRODUCTION_COUNT' });

describe('ответы на вопросы', () => {
  it('предлагает работу по флагу, аварию по флагу и перегрев по температуре', () => {
    const a = suggestAnswers([run, alarm, speed, temp, count]);
    expect(a.run).toMatchObject({ mode: 'flag', signalId: 'run' });
    expect(a.alarm).toMatchObject({ enabled: true, signalId: 'alarm' });
    expect(a.overheat).toMatchObject({ enabled: true, signalId: 'temp', value: 180 });
    const rules = answersToRules(a);
    expect(rules.map((r) => [r.name, r.targetState, r.priority])).toEqual([['Авария', 'DOWN', 100], ['Перегрев', 'DOWN', 90], ['Работа', 'RUN', 50]]);
  });

  it('без флага работы берёт порог скорости, а не счётчик', () => {
    const a = suggestAnswers([speed, count]);
    expect(a.run).toMatchObject({ mode: 'threshold', signalId: 'speed', value: 5 });
    expect(a.alarm.enabled).toBe(false);
  });

  it('правила из вопросов распознаются обратно', () => {
    const a = suggestAnswers([run, alarm, temp]);
    const back = rulesToAnswers(answersToRules(a), [run, alarm, temp]);
    expect(back && answersToRules(back)).toEqual(answersToRules(a));
  });

  it('сложные правила не превращаются в вопросы', () => {
    const rules = answersToRules(suggestAnswers([run]));
    expect(rulesToAnswers([{ ...rules[0], exitCondition: rules[0].enterCondition }], [run])).toBeNull();
    expect(rulesToAnswers([{ ...rules[0], targetState: 'SETUP' }], [run])).toBeNull();
    expect(rulesToAnswers([{ ...rules[0], enterCondition: { type: 'NOT', condition: rules[0].enterCondition } }], [run])).toBeNull();
  });
});

describe('условия', () => {
  it('плоское условие: одно сравнение или группа сравнений', () => {
    const c = defaultCompare(speed);
    expect(c).toEqual({ type: 'COMPARE', signalId: 'speed', operator: 'GT', value: 0 });
    expect(flatten(c)).toEqual({ join: 'ALL', items: [c] });
    const any = unflatten({ join: 'ANY', items: [c, defaultCompare(run)] });
    expect(any).toMatchObject({ type: 'ANY', conditions: [c, { operator: 'EQ', value: true }] });
    expect(flatten({ type: 'NOT', condition: c })).toBeNull();
  });

  it('для дробного «равно» добавляет допуск, для целого «одно из» — список', () => {
    expect(defaultCompare(speed, 'EQ')).toMatchObject({ tolerance: 0.01 });
    expect(defaultCompare(count, 'IN')).toMatchObject({ values: [] });
    expect(defaultCompare(run, 'GT').operator).toBe('EQ');
  });

  it('приоритеты по порядку и путь ошибки сервера', () => {
    const rules = answersToRules(suggestAnswers([run, alarm]));
    expect(withPriorities([rules[1], rules[0]]).map((r) => [r.name, r.priority])).toEqual([['Работа', 20], ['Авария', 10]]);
    expect(ruleIndexOf('rules[3].enterCondition.signalId')).toBe(3);
    expect(ruleIndexOf('offlineAfterMs')).toBeNull();
  });
});

describe('описание и проверка', () => {
  it('описывает конфигурацию человеческим языком', () => {
    const rules = answersToRules(suggestAnswers([run, alarm, temp]));
    const lines = describeConfig({ defaultState: 'IDLE', offlineAfterMs: 60_000, rules }, [run, alarm, temp]);
    expect(lines[0]).toBe('Авария — если «Авария» = да дольше 5 с');
    expect(lines[1]).toBe('Авария — если «Температура» не меньше (≥) 180 °C дольше 30 с');
    expect(lines[2]).toBe('Работа — если «Машина в работе» = да дольше 10 с');
    expect(lines.slice(-2)).toEqual(['Иначе — Простой.', 'Данные не приходят дольше 1 мин — «Нет данных».']);
  });

  it('ловит незаполненные условия до отправки', () => {
    const rules = answersToRules(suggestAnswers([speed]));
    const issues = localIssues({ defaultState: 'IDLE', offlineAfterMs: 60_000, rules: [{ ...rules[0], enterCondition: { ...defaultCompare(speed, 'EQ'), tolerance: 0 } }, { ...rules[0], name: ' ', enterCondition: { type: 'COMPARE', signalId: 'x', operator: 'GT', value: 1 } }] }, [speed]);
    expect(issues.get(0)?.[0]).toMatch(/допуск/);
    expect(issues.get(1)).toEqual(['Укажите название правила', 'Выберите сигнал в условии']);
    expect(localIssues({ defaultState: 'IDLE', offlineAfterMs: 1, rules: [] }, []).get(-1)).toBeTruthy();
  });
});
