import type { BehaviorConfiguration, BehaviorOverride, ExpectedMachineState, MachineTargetInput, ScenarioPhaseInput } from '@/shared/api';

export type Profile = 'stable' | 'typical' | 'problem';

export const PROFILES: Record<Profile, { label: string; hint: string; weights: Partial<Record<ExpectedMachineState, number>> }> = {
  stable: { label: 'Стабильная', hint: 'Почти всё время в работе, редкие короткие простои', weights: { RUN: 88, IDLE: 7, DOWN: 1, SETUP: 3, PLANNED_STOP: 1 } },
  typical: { label: 'Типовая', hint: 'Рабочая смена с простоями, переналадками и редкими авариями', weights: { RUN: 72, IDLE: 14, DOWN: 5, SETUP: 6, PLANNED_STOP: 3 } },
  problem: { label: 'Проблемная', hint: 'Частые простои и аварии — удобно показывать отчёты по потерям', weights: { RUN: 55, IDLE: 20, DOWN: 17, SETUP: 5, PLANNED_STOP: 3 } },
};

type Literal = number | boolean | string;
export interface Compare {
  type: 'COMPARE';
  signalId: string;
  operator: 'EQ' | 'NE' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'BETWEEN' | 'IN';
  value?: Literal;
  lower?: Literal;
  upper?: Literal;
  values?: Literal[];
}
export interface Cond {
  type: string;
  signalId?: string;
  operator?: Compare['operator'];
  value?: Literal;
  lower?: Literal;
  upper?: Literal;
  values?: Literal[];
  conditions?: Cond[];
  condition?: Cond;
}
export interface RuleLike {
  priority: number;
  targetState: string;
  enterCondition: Cond;
  activationDelayMs: number;
}
export interface SignalLike {
  id: string;
  code: string;
  name: string;
  valueType: string;
  signalKind: string;
  validMin?: number | null;
  validMax?: number | null;
}
export interface MachineInput {
  machine: { id: string; name: string; nominalRate?: number | null };
  signals: SignalLike[];
  config: { defaultState: string; rules: RuleLike[] } | null;
}
export interface BuildOptions {
  profile: Profile;
  intervalMs: number;
  /** Длина полного цикла фаз; фазы делят её по весам профиля. */
  cycleMs?: number;
}
export interface Built {
  machineTargets: MachineTargetInput[];
  phases: ScenarioPhaseInput[];
  notes: string[];
  signalCount: number;
}

const STATE_NAME: Record<ExpectedMachineState, string> = { RUN: 'Работа', IDLE: 'Простой', SETUP: 'Переналадка', DOWN: 'Авария', PLANNED_STOP: 'Плановая остановка', OFFLINE: 'Нет связи' };
const ORDER: ExpectedMachineState[] = ['RUN', 'IDLE', 'SETUP', 'DOWN', 'PLANNED_STOP'];
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const delta = (v: number) => Math.max(1, Math.abs(v) * 0.15);

/** Все сравнения, которые надо выполнить одновременно, чтобы условие сработало (ANY — первая ветка, NOT пропускаем). */
export function leaves(c: Cond | null | undefined): Compare[] {
  if (!c) return [];
  if (c.type === 'COMPARE' && c.signalId && c.operator) return [c as Compare];
  if (c.type === 'ALL') return (c.conditions ?? []).flatMap(leaves);
  if (c.type === 'ANY') return leaves(c.conditions?.[0]);
  return [];
}

type Target = { value: Literal; sd: number };

/** Значение сигнала, при котором сравнение выполняется (`holds`) либо заведомо не выполняется. */
export function pick(c: Compare, holds: boolean): Target {
  const v = c.value;
  const n = isNum(v) ? v : undefined;
  const up = (x: number, k = 1) => ({ value: x, sd: (delta(x) * k) / 6 });
  switch (c.operator) {
    case 'GT':
      return n == null ? { value: v ?? 0, sd: 0 } : holds ? up(n + delta(n)) : up(n - delta(n));
    case 'GTE':
      return n == null ? { value: v ?? 0, sd: 0 } : holds ? up(n + delta(n) / 2) : up(n - delta(n));
    case 'LT':
      return n == null ? { value: v ?? 0, sd: 0 } : holds ? up(n - delta(n)) : up(n + delta(n));
    case 'LTE':
      return n == null ? { value: v ?? 0, sd: 0 } : holds ? up(n - delta(n) / 2) : up(n + delta(n));
    case 'EQ':
      if (holds) return { value: v ?? 0, sd: 0 };
      return n != null ? { value: n + delta(n), sd: 0 } : typeof v === 'boolean' ? { value: !v, sd: 0 } : { value: `${v ?? ''}_OTHER`, sd: 0 };
    case 'NE':
      if (!holds) return { value: v ?? 0, sd: 0 };
      return n != null ? { value: n + delta(n), sd: 0 } : typeof v === 'boolean' ? { value: !v, sd: 0 } : { value: `${v ?? ''}_OTHER`, sd: 0 };
    case 'BETWEEN': {
      const lo = isNum(c.lower) ? c.lower : 0;
      const hi = isNum(c.upper) ? c.upper : lo + 1;
      return holds ? { value: (lo + hi) / 2, sd: (hi - lo) / 12 } : { value: hi + delta(hi), sd: 0 };
    }
    case 'IN': {
      const list = c.values ?? [];
      if (holds) return { value: list[0] ?? 0, sd: 0 };
      const nums = list.filter(isNum);
      return nums.length ? { value: Math.max(...nums) + delta(Math.max(...nums)), sd: 0 } : { value: 'OTHER', sd: 0 };
    }
  }
}

function behavior(s: SignalLike, t: Target, intervalMs: number): BehaviorConfiguration {
  const common = { generationIntervalMs: intervalMs, sourceQuality: 'GOOD', missingProbability: 0 };
  const numeric = s.valueType === 'DOUBLE' || s.valueType === 'LONG';
  if (!numeric || !isNum(t.value) || t.sd === 0) return { model: 'CONSTANT', ...common, value: t.value } as BehaviorConfiguration;
  const clampMin = isNum(s.validMin) ? s.validMin : undefined;
  const clampMax = isNum(s.validMax) ? s.validMax : undefined;
  return { model: 'NORMAL', ...common, mean: t.value, standardDeviation: t.sd, ...(clampMin != null ? { clampMin } : {}), ...(clampMax != null ? { clampMax } : {}) } as BehaviorConfiguration;
}

/** «Нейтральное» значение для сигнала, который не упомянут в правилах. */
function neutral(s: SignalLike, nominalRate: number | null | undefined, intervalMs: number): BehaviorConfiguration | null {
  const common = { generationIntervalMs: intervalMs, sourceQuality: 'GOOD', missingProbability: 0 };
  if (s.signalKind === 'COUNTER') return { model: 'COUNTER_RATE', ...common, initialValue: 0, incrementPerSecond: isNum(nominalRate) && nominalRate > 0 ? Math.round((nominalRate / 3600) * 100) / 100 : 1 } as BehaviorConfiguration;
  if (s.signalKind === 'STATE' || (s.valueType !== 'DOUBLE' && s.valueType !== 'LONG')) return null;
  const lo = isNum(s.validMin) ? s.validMin : undefined;
  const hi = isNum(s.validMax) ? s.validMax : undefined;
  const mean = lo != null && hi != null ? lo + (hi - lo) * 0.45 : lo != null ? lo + 50 : hi != null ? hi - 50 : 50;
  const sd = lo != null && hi != null ? Math.max((hi - lo) * 0.03, 0.01) : 2;
  return { model: 'NORMAL', ...common, mean, standardDeviation: sd, ...(lo != null ? { clampMin: lo } : {}), ...(hi != null ? { clampMax: hi } : {}) } as BehaviorConfiguration;
}

const ruleFor = (m: MachineInput, state: string) =>
  (m.config?.rules ?? []).filter((r) => r.targetState === state).sort((a, b) => b.priority - a.priority)[0];

export function buildScenario(inputs: MachineInput[], opts: BuildOptions): Built {
  const notes: string[] = [];
  const cycleMs = opts.cycleMs ?? 2 * 3600_000;
  const weights = PROFILES[opts.profile].weights;

  // какие состояния реально можно изобразить правилами хотя бы одной машины
  const states = new Set<ExpectedMachineState>(['RUN']);
  for (const m of inputs) {
    for (const r of m.config?.rules ?? []) if (ORDER.includes(r.targetState as ExpectedMachineState)) states.add(r.targetState as ExpectedMachineState);
    if (m.config && ORDER.includes(m.config.defaultState as ExpectedMachineState)) states.add(m.config.defaultState as ExpectedMachineState);
  }
  const phaseStates = ORDER.filter((s) => states.has(s));

  const machineTargets: MachineTargetInput[] = inputs.map((m) => {
    if (!m.config) notes.push(`«${m.machine.name}»: нет правил состояний — состояние по данным не определится`);
    if (!m.signals.length) notes.push(`«${m.machine.name}»: нет активных сигналов — данные не будут сформированы`);
    const run = ruleFor(m, 'RUN');
    const runTargets = new Map(leaves(run?.enterCondition).map((c) => [c.signalId, pick(c, true)]));
    const baseBehaviors = m.signals.flatMap((s) => {
      const t = runTargets.get(s.id);
      const b = t ? behavior(s, t, opts.intervalMs) : neutral(s, m.machine.nominalRate, opts.intervalMs);
      return b ? [{ signalId: s.id, behavior: b }] : [];
    });
    return { machineId: m.machine.id, baseBehaviors };
  });

  const total = phaseStates.reduce((a, s) => a + (weights[s] ?? 5), 0);
  const phases: ScenarioPhaseInput[] = phaseStates.map((state) => {
    const overrides: BehaviorOverride[] = [];
    let minMs = 120_000;
    for (const m of inputs) {
      const byId = new Map(m.signals.map((s) => [s.id, s]));
      const rule = ruleFor(m, state);
      if (rule) {
        minMs = Math.max(minMs, rule.activationDelayMs * 2 + 90_000);
        if (state === 'RUN') continue; // базовое поведение уже «рабочее»
        for (const c of leaves(rule.enterCondition)) {
          const s = byId.get(c.signalId);
          if (s) overrides.push({ signalId: s.id, action: 'REPLACE', behavior: behavior(s, pick(c, true), opts.intervalMs) });
        }
      } else if (state !== 'RUN' && m.config?.defaultState === state) {
        // состояние по умолчанию наступает, когда рабочее правило перестало выполняться
        for (const c of leaves(ruleFor(m, 'RUN')?.enterCondition)) {
          const s = byId.get(c.signalId);
          if (s) overrides.push({ signalId: s.id, action: 'REPLACE', behavior: behavior(s, pick(c, false), opts.intervalMs) });
        }
      }
    }
    const share = (weights[state] ?? 5) / total;
    const durationMs = Math.max(minMs, Math.round((cycleMs * share) / 1000) * 1000);
    return { code: state, name: STATE_NAME[state], durationMs, expectedState: state, behaviorOverrides: overrides };
  });

  return { machineTargets, phases, notes, signalCount: machineTargets.reduce((a, t) => a + t.baseBehaviors.length, 0) };
}

/** Грубая оценка числа измерений за период. */
export function estimateMeasurements(built: Built, spanMs: number, intervalMs: number) {
  return Math.round((spanMs / intervalMs) * built.signalCount);
}
