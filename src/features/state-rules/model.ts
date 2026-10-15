import type { ComparisonOperator, Condition, MachineStateConfigurationInput, StateRuleInput, TelemetrySignal, UserMachineState } from '@/shared/api';
import { enumLabel, MACHINE_STATE, OPERATOR, unitLabel } from '@/shared/i18n';
import { formatMs } from '@/shared/lib';

/** Минимум о сигнале, нужный редактору правил. */
export type RuleSignal = Pick<TelemetrySignal, 'id' | 'name' | 'valueType' | 'signalKind' | 'semanticCode' | 'unitCode' | 'validMax' | 'status'>;
export type Compare = Extract<Condition, { type: 'COMPARE' }>;
export type Literal = string | number | boolean;
export type Join = 'ALL' | 'ANY';

// ---------- Операторы ----------

/** Допустимые операторы по формату значения (condition-ast.md). */
export const OPERATORS_FOR: Record<RuleSignal['valueType'], ComparisonOperator[]> = {
  DOUBLE: ['GT', 'GTE', 'LT', 'LTE', 'BETWEEN', 'EQ', 'NE'],
  LONG: ['GT', 'GTE', 'LT', 'LTE', 'BETWEEN', 'EQ', 'NE', 'IN'],
  BOOLEAN: ['EQ', 'NE'],
  STRING: ['EQ', 'NE', 'IN'],
};

export const DEFAULT_TOLERANCE = 0.01;

/** Условие сравнения по умолчанию для сигнала: флаг «= да», число «> 0», текст «= ""». */
export function defaultCompare(signal: RuleSignal, operator?: ComparisonOperator): Compare {
  const op = operator && OPERATORS_FOR[signal.valueType].includes(operator) ? operator : signal.valueType === 'BOOLEAN' || signal.valueType === 'STRING' ? 'EQ' : 'GT';
  const base: Compare = { type: 'COMPARE', signalId: signal.id, operator: op };
  if (op === 'BETWEEN') return { ...base, lower: 0, upper: 1 };
  if (op === 'IN') return { ...base, values: [] };
  const value: Literal = signal.valueType === 'BOOLEAN' ? true : signal.valueType === 'STRING' ? '' : 0;
  return signal.valueType === 'DOUBLE' && (op === 'EQ' || op === 'NE') ? { ...base, value, tolerance: DEFAULT_TOLERANCE } : { ...base, value };
}

// ---------- Плоские условия ----------

export interface FlatCondition {
  join: Join;
  items: Compare[];
}

/** Одно сравнение или «все/любое» из сравнений; null — условие сложнее (NOT, вложенность). */
export function flatten(c: Condition | null | undefined): FlatCondition | null {
  if (!c) return null;
  if (c.type === 'COMPARE') return { join: 'ALL', items: [c] };
  if ((c.type === 'ALL' || c.type === 'ANY') && c.conditions.length > 0 && c.conditions.every((x) => x.type === 'COMPARE')) {
    return { join: c.type, items: c.conditions as Compare[] };
  }
  return null;
}

export function unflatten(f: FlatCondition): Condition {
  return f.items.length === 1 ? f.items[0] : { type: f.join, conditions: f.items };
}

// ---------- Ответы на вопросы ----------

export interface Answers {
  run: { mode: 'flag' | 'threshold' | 'none'; signalId: string; value: number; delayMs: number; releaseMs: number; id?: string | null };
  alarm: { enabled: boolean; signalId: string; delayMs: number; releaseMs: number; id?: string | null };
  overheat: { enabled: boolean; signalId: string; value: number; delayMs: number; releaseMs: number; id?: string | null };
}

const active = (signals: RuleSignal[]) => signals.filter((s) => s.status === 'ACTIVE');
const isNum = (s: RuleSignal) => s.valueType === 'DOUBLE' || s.valueType === 'LONG';
const round = (v: number) => Math.round(v * 100) / 100;

export const flagSignals = (signals: RuleSignal[], semantic?: string) => active(signals).filter((s) => s.valueType === 'BOOLEAN' && (!semantic || s.semanticCode === semantic));
export const numericSignals = (signals: RuleSignal[]) => active(signals).filter((s) => isNum(s) && s.signalKind !== 'COUNTER');

const SPEED = /SPEED|LOAD|CURRENT|POWER/;

/** Ответы по набору сигналов: флаг работы → по флагу, иначе скорость/нагрузка; авария по флагу; перегрев по температуре. */
export function suggestAnswers(signals: RuleSignal[]): Answers {
  const runFlag = flagSignals(signals, 'OPERATING_FLAG')[0];
  const nums = numericSignals(signals);
  const speed = nums.find((s) => SPEED.test(s.semanticCode)) ?? nums.find((s) => s.semanticCode !== 'TEMPERATURE') ?? nums[0];
  const alarm = flagSignals(signals, 'ALARM_FLAG')[0];
  const temp = nums.find((s) => s.semanticCode === 'TEMPERATURE');
  const threshold = speed?.validMax ? Math.max(round(speed.validMax * 0.05), 0.01) : 1;
  return {
    run: runFlag
      ? { mode: 'flag', signalId: runFlag.id, value: 0, delayMs: 10_000, releaseMs: 30_000 }
      : speed
        ? { mode: 'threshold', signalId: speed.id, value: threshold, delayMs: 10_000, releaseMs: 30_000 }
        : { mode: 'none', signalId: '', value: 0, delayMs: 10_000, releaseMs: 30_000 },
    alarm: { enabled: !!alarm, signalId: alarm?.id ?? '', delayMs: 5_000, releaseMs: 30_000 },
    overheat: { enabled: !!temp?.validMax, signalId: temp?.id ?? '', value: temp?.validMax ? round(temp.validMax * 0.9) : 90, delayMs: 30_000, releaseMs: 60_000 },
  };
}

const cmp = (signalId: string, operator: ComparisonOperator, value: Literal): Compare => ({ type: 'COMPARE', signalId, operator, value });

export function answersToRules(a: Answers): StateRuleInput[] {
  const rules: StateRuleInput[] = [];
  if (a.alarm.enabled && a.alarm.signalId) rules.push({ id: a.alarm.id ?? null, name: 'Авария', priority: 100, targetState: 'DOWN', enterCondition: cmp(a.alarm.signalId, 'EQ', true), exitCondition: null, activationDelayMs: a.alarm.delayMs, releaseDelayMs: a.alarm.releaseMs });
  if (a.overheat.enabled && a.overheat.signalId) rules.push({ id: a.overheat.id ?? null, name: 'Перегрев', priority: 90, targetState: 'DOWN', enterCondition: cmp(a.overheat.signalId, 'GTE', a.overheat.value), exitCondition: null, activationDelayMs: a.overheat.delayMs, releaseDelayMs: a.overheat.releaseMs });
  if (a.run.mode !== 'none' && a.run.signalId) {
    const enter = a.run.mode === 'flag' ? cmp(a.run.signalId, 'EQ', true) : cmp(a.run.signalId, 'GT', a.run.value);
    rules.push({ id: a.run.id ?? null, name: 'Работа', priority: 50, targetState: 'RUN', enterCondition: enter, exitCondition: null, activationDelayMs: a.run.delayMs, releaseDelayMs: a.run.releaseMs });
  }
  return rules;
}

/** Обратное преобразование: правила, которые можно показать вопросами; null — правила сложнее. */
export function rulesToAnswers(rules: StateRuleInput[], signals: RuleSignal[]): Answers | null {
  const byId = new Map(signals.map((s) => [s.id, s]));
  const base = suggestAnswers([]);
  const a: Answers = { run: { ...base.run }, alarm: { ...base.alarm }, overheat: { ...base.overheat } };
  const seen = { run: false, alarm: false, overheat: false };
  for (const r of rules) {
    const c = r.enterCondition;
    if (c.type !== 'COMPARE' || r.exitCondition) return null;
    const s = byId.get(c.signalId);
    if (!s) return null;
    const common = { signalId: s.id, delayMs: r.activationDelayMs, releaseMs: r.releaseDelayMs, id: r.id ?? null };
    if (r.targetState === 'RUN' && !seen.run) {
      if (s.valueType === 'BOOLEAN' && c.operator === 'EQ' && c.value === true) a.run = { ...common, mode: 'flag', value: 0 };
      else if (isNum(s) && c.operator === 'GT' && typeof c.value === 'number') a.run = { ...common, mode: 'threshold', value: c.value };
      else return null;
      seen.run = true;
    } else if (r.targetState === 'DOWN' && s.valueType === 'BOOLEAN' && c.operator === 'EQ' && c.value === true && !seen.alarm) {
      a.alarm = { ...common, enabled: true };
      seen.alarm = true;
    } else if (r.targetState === 'DOWN' && isNum(s) && c.operator === 'GTE' && typeof c.value === 'number' && !seen.overheat) {
      a.overheat = { ...common, enabled: true, value: c.value };
      seen.overheat = true;
    } else return null;
  }
  if (!seen.run) a.run = { ...a.run, mode: 'none', signalId: '' };
  if (!seen.alarm) a.alarm = { ...a.alarm, enabled: false, signalId: '' };
  if (!seen.overheat) a.overheat = { ...a.overheat, enabled: false, signalId: '' };
  return a;
}

/** Приоритеты по порядку: первое правило важнее (уникальные, шаг 10). */
export const withPriorities = (rules: StateRuleInput[]): StateRuleInput[] => rules.map((r, i) => ({ ...r, priority: (rules.length - i) * 10 }));

export const sortByPriority = (rules: StateRuleInput[]) => [...rules].sort((a, b) => b.priority - a.priority);

// ---------- Описание текстом ----------

const quote = (s: string) => `«${s}»`;

function literal(v: unknown, s: RuleSignal | undefined): string {
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  if (typeof v === 'number') return `${v.toLocaleString('ru-RU')}${s?.unitCode ? ` ${unitLabel(s.unitCode)}` : ''}`;
  return `"${String(v ?? '')}"`;
}

export function describeCondition(c: Condition | null | undefined, signals: RuleSignal[]): string {
  if (!c) return '—';
  if (c.type === 'ALL' || c.type === 'ANY') return c.conditions.map((x) => describeCondition(x, signals)).join(c.type === 'ALL' ? ' и ' : ' или ');
  if (c.type === 'NOT') return `не (${describeCondition(c.condition, signals)})`;
  const s = signals.find((x) => x.id === c.signalId);
  const name = s ? quote(s.name) : 'сигнал не выбран';
  if (s?.valueType === 'BOOLEAN' && (c.operator === 'EQ' || c.operator === 'NE')) return `${name} ${c.operator === 'EQ' ? '=' : '≠'} ${literal(c.value, s)}`;
  if (c.operator === 'BETWEEN') return `${name} от ${literal(c.lower, s)} до ${literal(c.upper, s)}`;
  if (c.operator === 'IN') return `${name} одно из: ${(c.values ?? []).map((v) => literal(v, s)).join(', ') || '—'}`;
  const tol = c.tolerance != null ? ` (±${c.tolerance})` : '';
  return `${name} ${enumLabel(OPERATOR, c.operator)} ${literal(c.value, s)}${tol}`;
}

export function describeConfig(cfg: MachineStateConfigurationInput, signals: RuleSignal[]): string[] {
  const lines = sortByPriority(cfg.rules).map((r) => {
    const delay = r.activationDelayMs > 0 ? ` дольше ${formatMs(r.activationDelayMs)}` : '';
    const exit = r.exitCondition ? `; выход — когда ${describeCondition(r.exitCondition, signals)}` : '';
    return `${enumLabel(MACHINE_STATE, r.targetState)} — если ${describeCondition(r.enterCondition, signals)}${delay}${exit}`;
  });
  lines.push(`Иначе — ${enumLabel(MACHINE_STATE, cfg.defaultState)}.`);
  lines.push(`Данные не приходят дольше ${formatMs(cfg.offlineAfterMs)} — «${MACHINE_STATE.OFFLINE.label}».`);
  return lines;
}

// ---------- Клиентская проверка ----------

/** Ошибки, которые видно без сервера: незаполненные сигнал, значение, допуск. Ключ — индекс правила. */
export function localIssues(cfg: MachineStateConfigurationInput, signals: RuleSignal[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const add = (i: number, m: string) => out.set(i, [...(out.get(i) ?? []), m]);
  if (!cfg.rules.length) add(-1, 'Добавьте хотя бы одно правило');
  cfg.rules.forEach((r, i) => {
    if (!r.name.trim()) add(i, 'Укажите название правила');
    const check = (c: Condition | null | undefined) => {
      if (!c) return;
      if (c.type === 'ALL' || c.type === 'ANY') return c.conditions.forEach(check);
      if (c.type === 'NOT') return check(c.condition);
      const s = signals.find((x) => x.id === c.signalId);
      if (!s) return add(i, 'Выберите сигнал в условии');
      if (c.operator === 'BETWEEN' && (typeof c.lower !== 'number' || typeof c.upper !== 'number' || c.lower > c.upper)) add(i, `${quote(s.name)}: задайте диапазон «от» не больше «до»`);
      if (c.operator === 'IN' && !(c.values?.length)) add(i, `${quote(s.name)}: перечислите значения`);
      if (s.valueType === 'DOUBLE' && (c.operator === 'EQ' || c.operator === 'NE') && !(typeof c.tolerance === 'number' && c.tolerance > 0)) add(i, `${quote(s.name)}: для дробного числа нужен допуск больше 0`);
      if (s.valueType === 'LONG' && typeof c.value === 'number' && !Number.isInteger(c.value)) add(i, `${quote(s.name)}: нужно целое число`);
    };
    check(r.enterCondition);
    check(r.exitCondition);
  });
  return out;
}

/** Индекс правила из пути ошибки сервера: «rules[2].enterCondition…» → 2. */
export function ruleIndexOf(path: string | null | undefined): number | null {
  const m = /^rules\[(\d+)\]/.exec(path ?? '');
  return m ? Number(m[1]) : null;
}

export const STATE_FOR_RULE: UserMachineState[] = ['RUN', 'DOWN', 'IDLE', 'SETUP', 'PLANNED_STOP'];
