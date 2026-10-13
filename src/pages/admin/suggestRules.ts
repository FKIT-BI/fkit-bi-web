import type { MachineStateConfigurationInput, StateRuleInput, TelemetrySignal } from '@/shared/api';

type Sig = Pick<TelemetrySignal, 'id' | 'code' | 'name' | 'valueType' | 'signalKind' | 'semanticCode' | 'validMin' | 'validMax' | 'status'>;

const SPEED = /SPEED|LINE_RATE|FEED|THROUGHPUT/;
const nz = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
const round = (v: number) => Math.round(v * 100) / 100;

const cmp = (signalId: string, operator: 'EQ' | 'GT' | 'GTE' | 'LT' | 'LTE', value: number | boolean) => ({ type: 'COMPARE' as const, signalId, operator, value });

/**
 * Черновик правил состояний по набору сигналов машины: авария (флаг, перегрев) → DOWN, работа (флаг работы, скорость, нагрузка) → RUN,
 * всё остальное — состояние по умолчанию (простой). Это стартовая точка — пороги стоит уточнить под оборудование.
 */
export function suggestRules(signals: Sig[]): { config: MachineStateConfigurationInput; notes: string[] } {
  const active = signals.filter((s) => s.status === 'ACTIVE');
  const numeric = (s: Sig) => s.valueType === 'DOUBLE' || s.valueType === 'LONG';
  const bySemantic = (re: RegExp) => active.find((s) => re.test(s.semanticCode) || re.test(s.code));
  const notes: string[] = [];
  const rules: StateRuleInput[] = [];

  const alarm = active.find((s) => s.semanticCode === 'ALARM_FLAG' && s.valueType === 'BOOLEAN');
  if (alarm) rules.push({ name: 'Авария по флагу', priority: 100, targetState: 'DOWN', enterCondition: cmp(alarm.id, 'EQ', true), exitCondition: null, activationDelayMs: 5000, releaseDelayMs: 30_000 });

  const temp = active.find((s) => s.semanticCode === 'TEMPERATURE' && numeric(s));
  if (temp) {
    if (nz(temp.validMax)) rules.push({ name: 'Перегрев', priority: 90, targetState: 'DOWN', enterCondition: cmp(temp.id, 'GTE', round(temp.validMax * 0.9)), exitCondition: cmp(temp.id, 'LT', round(temp.validMax * 0.8)), activationDelayMs: 30_000, releaseDelayMs: 60_000 });
    else notes.push(`У сигнала «${temp.name}» не задан допустимый максимум — правило перегрева не создано`);
  }

  const flag = active.find((s) => s.semanticCode === 'OPERATING_FLAG' && s.valueType === 'BOOLEAN');
  const speed = active.find((s) => SPEED.test(s.semanticCode) && numeric(s) && s.signalKind !== 'COUNTER') ?? bySemantic(/SPEED/);
  const load = active.find((s) => s.semanticCode === 'LOAD_PERCENT' && numeric(s));
  const anyGauge = active.find((s) => numeric(s) && s.signalKind === 'GAUGE' && s !== temp);

  if (flag) {
    rules.push({ name: 'Работа по флагу', priority: 50, targetState: 'RUN', enterCondition: cmp(flag.id, 'EQ', true), exitCondition: null, activationDelayMs: 10_000, releaseDelayMs: 30_000 });
  } else {
    const basis = speed ?? load ?? anyGauge;
    if (basis) {
      const threshold = nz(basis.validMax) ? Math.max(round(basis.validMax * 0.05), 0.01) : 1;
      rules.push({ name: `Работа: ${basis.name}`, priority: 50, targetState: 'RUN', enterCondition: cmp(basis.id, 'GT', threshold), exitCondition: cmp(basis.id, 'LTE', round(threshold / 2)), activationDelayMs: 10_000, releaseDelayMs: 30_000 });
      if (!speed && !load) notes.push(`Нет сигналов скорости или нагрузки — «работа» определена по «${basis.name}», проверьте порог`);
    } else notes.push('Нет подходящих числовых сигналов — правило «Работа» не создано, добавьте его вручную');
  }

  if (!rules.length) notes.push('Не удалось подобрать ни одного правила: добавьте сигналы (скорость, температура, флаги) или задайте правила вручную');
  return { config: { defaultState: 'IDLE', offlineAfterMs: 60_000, rules }, notes };
}
