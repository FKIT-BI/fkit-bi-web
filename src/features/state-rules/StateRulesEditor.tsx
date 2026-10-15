import { ActionIcon, Alert, Button, Card, Checkbox, Group, List, NativeSelect, NumberInput, Radio, SegmentedControl, Stack, Text, Textarea, TextInput, Title, Tooltip } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import type { ComparisonOperator, Condition, MachineStateConfigurationInput, StateRuleInput, UserMachineState, ValidationIssue } from '@/shared/api';
import { enumOptions, fieldLabel, HINT, MACHINE_STATE, OPERATOR, unitLabel, USER_STATES } from '@/shared/i18n';
import { DurationInput, EnumSelect, HintLabel } from '@/shared/ui';
import {
  answersToRules,
  defaultCompare,
  DEFAULT_TOLERANCE,
  describeConfig,
  flagSignals,
  flatten,
  localIssues,
  numericSignals,
  OPERATORS_FOR,
  ruleIndexOf,
  rulesToAnswers,
  sortByPriority,
  suggestAnswers,
  unflatten,
  withPriorities,
  type Answers,
  type Compare,
  type FlatCondition,
  type RuleSignal,
} from './model';

type Mode = 'questions' | 'detailed' | 'json';

export interface StateRulesEditorProps {
  signals: RuleSignal[];
  value: MachineStateConfigurationInput;
  onChange: (value: MachineStateConfigurationInput) => void;
  readOnly?: boolean;
  /** Ошибки и предупреждения сервера (validate/PUT): показываются у своего правила. */
  issues?: ValidationIssue[];
}

/** Начальная конфигурация для машины без правил: предложение по её сигналам. */
export function initialConfig(signals: RuleSignal[]): MachineStateConfigurationInput {
  return { defaultState: 'IDLE', offlineAfterMs: 60_000, rules: answersToRules(suggestAnswers(signals)) };
}

/**
 * Редактор правил состояния: вопросы («когда в работе?», «когда авария?») для типового случая,
 * подробная таблица условий и JSON для экспертов. Источник истины — `value.rules`.
 */
export function StateRulesEditor({ signals, value, onChange, readOnly, issues = [] }: StateRulesEditorProps) {
  const active = signals.filter((s) => s.status === 'ACTIVE');
  const parsed = rulesToAnswers(value.rules, active);
  const [mode, setMode] = useState<Mode>(() => (value.rules.length === 0 || parsed ? 'questions' : 'detailed'));
  const [answers, setAnswers] = useState<Answers>(() => parsed ?? suggestAnswers(active));
  const [json, setJson] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const setRules = (rules: StateRuleInput[]) => onChange({ ...value, rules });
  const setAnswersAndRules = (a: Answers) => {
    setAnswers(a);
    setRules(answersToRules(a));
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (mode === 'json') {
      try {
        const rules = JSON.parse(json) as StateRuleInput[];
        if (!Array.isArray(rules)) throw new Error('ожидается массив правил');
        setRules(rules);
        setJsonError(null);
        if (next === 'questions') {
          const a = rulesToAnswers(rules, active);
          if (!a) return setJsonError('Эти правила не описываются вопросами — откройте «Подробно».');
          setAnswers(a);
        }
      } catch (e) {
        return setJsonError(`Некорректный JSON: ${(e as Error).message}`);
      }
    }
    if (next === 'questions' && mode !== 'json') {
      const a = rulesToAnswers(value.rules, active);
      if (!a) {
        if (!window.confirm('Текущие правила сложнее, чем вопросы. Заменить их ответами на вопросы?')) return;
        setAnswersAndRules(suggestAnswers(active));
      } else setAnswers(a);
    }
    if (next === 'json') setJson(JSON.stringify(sortByPriority(value.rules), null, 2));
    setMode(next);
  };

  const local = localIssues(value, active);
  const byRule = new Map<number, string[]>();
  for (const i of issues) {
    const idx = ruleIndexOf(i.path);
    if (idx == null) continue;
    byRule.set(idx, [...(byRule.get(idx) ?? []), i.message]);
  }
  const general = issues.filter((i) => ruleIndexOf(i.path) == null);

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="wrap">
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(v) => switchMode(v as Mode)}
          data={[
            { value: 'questions', label: 'Вопросы' },
            { value: 'detailed', label: 'Подробно' },
            { value: 'json', label: 'JSON для экспертов' },
          ]}
        />
        {!readOnly && mode !== 'json' && (
          <Button size="xs" variant="subtle" onClick={() => (mode === 'questions' ? setAnswersAndRules(suggestAnswers(active)) : setRules(answersToRules(suggestAnswers(active))))}>
            Предложить по сигналам
          </Button>
        )}
      </Group>

      {!active.length && <Alert color="orange" p="xs">У машины нет активных сигналов — правила не на чем построить. Добавьте сигналы.</Alert>}

      {mode === 'questions' && <Questions signals={active} answers={answers} onChange={setAnswersAndRules} readOnly={readOnly} />}
      {mode === 'detailed' && <Detailed signals={active} rules={value.rules} onChange={setRules} readOnly={readOnly} issues={byRule} local={local} />}
      {mode === 'json' && (
        <Textarea
          label="Правила (JSON)"
          description="Массив правил как в API. При переключении на другую вкладку JSON будет разобран."
          disabled={readOnly}
          autosize
          minRows={10}
          maxRows={24}
          styles={{ input: { fontFamily: 'ui-monospace, monospace', fontSize: 12 } }}
          value={json}
          error={jsonError}
          onChange={(e) => setJson(e.currentTarget.value)}
          onBlur={() => {
            try {
              const rules = JSON.parse(json) as StateRuleInput[];
              if (Array.isArray(rules)) {
                setRules(rules);
                setJsonError(null);
              }
            } catch (e) {
              setJsonError(`Некорректный JSON: ${(e as Error).message}`);
            }
          }}
        />
      )}

      <Group grow align="flex-start" wrap="wrap">
        <EnumSelect
          label="Во всех остальных случаях машина в состоянии"
          hint={HINT.defaultState}
          disabled={readOnly}
          options={enumOptions(MACHINE_STATE, USER_STATES)}
          value={value.defaultState}
          onChange={(v) => onChange({ ...value, defaultState: v as UserMachineState })}
        />
        <DurationInput label="«Нет данных», если данные не приходят" hint={HINT.offlineAfter} disabled={readOnly} min={1} value={value.offlineAfterMs} onChange={(v) => onChange({ ...value, offlineAfterMs: v === '' ? 0 : v })} />
      </Group>

      {(local.get(-1) || general.length > 0) && (
        <Alert color="red" p="xs">
          {local.get(-1)?.map((m) => <Text key={m} size="sm">{m}</Text>)}
          {general.map((i, n) => <Text key={n} size="sm">{i.path ? `${fieldLabel(i.path)}: ` : ''}{i.message}</Text>)}
        </Alert>
      )}

      <Card withBorder padding="sm" bg="var(--mantine-color-default-hover)">
        <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={4}>Как будет определяться состояние</Text>
        <List size="sm" spacing={2}>
          {describeConfig(value, active).map((l, i) => <List.Item key={i}>{l}</List.Item>)}
        </List>
      </Card>
    </Stack>
  );
}

// ---------- Вопросы ----------

const signalOptions = (list: RuleSignal[]) => list.map((s) => ({ value: s.id, label: `${s.name}${s.unitCode ? `, ${unitLabel(s.unitCode)}` : ''}` }));

function Questions({ signals, answers: a, onChange, readOnly }: { signals: RuleSignal[]; answers: Answers; onChange: (a: Answers) => void; readOnly?: boolean }) {
  const flags = flagSignals(signals);
  const nums = numericSignals(signals);
  const runSignal = signals.find((s) => s.id === a.run.signalId);
  const heatSignal = signals.find((s) => s.id === a.overheat.signalId);
  const set = <K extends keyof Answers>(k: K, p: Partial<Answers[K]>) => onChange({ ...a, [k]: { ...a[k], ...p } });
  const pick = (list: RuleSignal[], current: string) => (list.some((s) => s.id === current) ? current : list[0]?.id ?? '');

  return (
    <Stack gap="md">
      <Question title="Когда считать, что машина в работе?">
        <Radio.Group
          value={a.run.mode}
          onChange={(v) => {
            const mode = v as Answers['run']['mode'];
            set('run', { mode, signalId: mode === 'flag' ? pick(flags, a.run.signalId) : mode === 'threshold' ? pick(nums, a.run.signalId) : '' });
          }}
        >
          <Stack gap={6}>
            <Radio value="flag" disabled={readOnly || !flags.length} label={flags.length ? 'Когда сигнал «в работе» = да' : 'Когда сигнал «в работе» = да (нет сигналов да/нет)'} />
            <Radio value="threshold" disabled={readOnly || !nums.length} label={nums.length ? 'Когда значение больше порога (скорость, нагрузка, обороты)' : 'Когда значение больше порога (нет числовых сигналов)'} />
            <Radio value="none" disabled={readOnly} label="Не определять автоматически" />
          </Stack>
        </Radio.Group>
        {a.run.mode === 'flag' && (
          <Group align="flex-end" wrap="wrap">
            <NativeSelect label="Сигнал" disabled={readOnly} data={signalOptions(flags)} value={a.run.signalId} onChange={(e) => set('run', { signalId: e.currentTarget.value })} />
            <Delay value={a.run.delayMs} onChange={(delayMs) => set('run', { delayMs })} readOnly={readOnly} />
          </Group>
        )}
        {a.run.mode === 'threshold' && (
          <Group align="flex-end" wrap="wrap">
            <NativeSelect label="Сигнал" disabled={readOnly} data={signalOptions(nums)} value={a.run.signalId} onChange={(e) => set('run', { signalId: e.currentTarget.value })} />
            <NumberInput label={`больше${runSignal?.unitCode ? `, ${unitLabel(runSignal.unitCode)}` : ''}`} w={130} disabled={readOnly} value={a.run.value} onChange={(v) => set('run', { value: Number(v) || 0 })} />
            <Delay value={a.run.delayMs} onChange={(delayMs) => set('run', { delayMs })} readOnly={readOnly} />
          </Group>
        )}
      </Question>

      <Question title="Когда считать, что машина в аварии?">
        <Checkbox
          disabled={readOnly || !flags.length}
          checked={a.alarm.enabled}
          label={flags.length ? 'Когда сигнал «авария» = да' : 'Когда сигнал «авария» = да (нет сигналов да/нет)'}
          onChange={(e) => set('alarm', { enabled: e.currentTarget.checked, signalId: pick(flagSignals(signals, 'ALARM_FLAG').length ? flagSignals(signals, 'ALARM_FLAG') : flags, a.alarm.signalId) })}
        />
        {a.alarm.enabled && (
          <Group align="flex-end" wrap="wrap" pl="xl">
            <NativeSelect label="Сигнал" disabled={readOnly} data={signalOptions(flags)} value={a.alarm.signalId} onChange={(e) => set('alarm', { signalId: e.currentTarget.value })} />
            <Delay value={a.alarm.delayMs} onChange={(delayMs) => set('alarm', { delayMs })} readOnly={readOnly} />
          </Group>
        )}
        <Checkbox
          disabled={readOnly || !nums.length}
          checked={a.overheat.enabled}
          label={nums.length ? 'Когда значение не ниже предела (например, перегрев)' : 'Когда значение не ниже предела (нет числовых сигналов)'}
          onChange={(e) => set('overheat', { enabled: e.currentTarget.checked, signalId: pick(nums.filter((s) => s.semanticCode === 'TEMPERATURE').length ? nums.filter((s) => s.semanticCode === 'TEMPERATURE') : nums, a.overheat.signalId) })}
        />
        {a.overheat.enabled && (
          <Group align="flex-end" wrap="wrap" pl="xl">
            <NativeSelect label="Сигнал" disabled={readOnly} data={signalOptions(nums)} value={a.overheat.signalId} onChange={(e) => set('overheat', { signalId: e.currentTarget.value })} />
            <NumberInput label={`не ниже${heatSignal?.unitCode ? `, ${unitLabel(heatSignal.unitCode)}` : ''}`} w={130} disabled={readOnly} value={a.overheat.value} onChange={(v) => set('overheat', { value: Number(v) || 0 })} />
            <Delay value={a.overheat.delayMs} onChange={(delayMs) => set('overheat', { delayMs })} readOnly={readOnly} />
          </Group>
        )}
        {!a.alarm.enabled && !a.overheat.enabled && <Text size="xs" c="dimmed">Аварии будут отмечаться только вручную, через регистрацию инцидента.</Text>}
      </Question>
    </Stack>
  );
}

function Question({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap={6}>
      <Title order={4} fz="sm">{title}</Title>
      {children}
    </Stack>
  );
}

function Delay({ value, onChange, readOnly, label = 'держится не меньше' }: { value: number; onChange: (ms: number) => void; readOnly?: boolean; label?: string }) {
  return (
    <div style={{ minWidth: 240 }}>
      <DurationInput label={label} hint="Защищает от кратких всплесков: состояние меняется, только если условие держится это время." disabled={readOnly} min={0} value={value} onChange={(v) => onChange(v === '' ? 0 : v)} />
    </div>
  );
}

// ---------- Подробно ----------

function Detailed({ signals, rules, onChange, readOnly, issues, local }: { signals: RuleSignal[]; rules: StateRuleInput[]; onChange: (r: StateRuleInput[]) => void; readOnly?: boolean; issues: Map<number, string[]>; local: Map<number, string[]> }) {
  const ordered = sortByPriority(rules);
  const indexOf = (r: StateRuleInput) => rules.indexOf(r);
  const commit = (list: StateRuleInput[]) => onChange(withPriorities(list));
  const update = (i: number, p: Partial<StateRuleInput>) => commit(ordered.map((r, n) => (n === i ? { ...r, ...p } : r)));
  const move = (i: number, d: -1 | 1) => {
    const list = [...ordered];
    [list[i], list[i + d]] = [list[i + d], list[i]];
    commit(list);
  };
  const add = () => {
    const s = signals[0];
    if (!s) return;
    commit([...ordered, { id: null, name: 'Новое правило', priority: 0, targetState: 'RUN', enterCondition: defaultCompare(s), exitCondition: null, activationDelayMs: 10_000, releaseDelayMs: 30_000 }]);
  };

  return (
    <Stack gap="sm">
      <Text size="xs" c="dimmed">Правила проверяются сверху вниз: если сработало несколько, побеждает верхнее (оно важнее).</Text>
      {ordered.map((r, i) => {
        const messages = [...(local.get(indexOf(r)) ?? []), ...(issues.get(indexOf(r)) ?? [])];
        return (
          <Card key={r.id ?? `new-${i}`} withBorder padding="sm">
            <Stack gap="xs">
              <Group gap="xs" align="flex-end" wrap="wrap">
                <TextInput label="Название" style={{ flex: 1, minWidth: 160 }} disabled={readOnly} value={r.name} onChange={(e) => update(i, { name: e.currentTarget.value })} />
                <EnumSelect label="Тогда состояние" w={220} disabled={readOnly} options={enumOptions(MACHINE_STATE, USER_STATES)} value={r.targetState} onChange={(v) => update(i, { targetState: v as UserMachineState })} />
                {!readOnly && (
                  <Group gap={2}>
                    <Tooltip label="Выше — важнее"><ActionIcon variant="subtle" aria-label="Поднять правило" disabled={i === 0} onClick={() => move(i, -1)}><IconArrowUp size={16} /></ActionIcon></Tooltip>
                    <ActionIcon variant="subtle" aria-label="Опустить правило" disabled={i === ordered.length - 1} onClick={() => move(i, 1)}><IconArrowDown size={16} /></ActionIcon>
                    <ActionIcon variant="subtle" color="red" aria-label="Удалить правило" onClick={() => commit(ordered.filter((_, n) => n !== i))}><IconTrash size={16} /></ActionIcon>
                  </Group>
                )}
              </Group>
              <ConditionEditor label="Если" signals={signals} value={r.enterCondition} onChange={(c) => update(i, { enterCondition: c })} readOnly={readOnly} />
              <Checkbox
                size="xs"
                disabled={readOnly}
                label="Своё условие выхода (иначе — когда условие «Если» перестаёт выполняться)"
                checked={!!r.exitCondition}
                onChange={(e) => update(i, { exitCondition: e.currentTarget.checked ? r.enterCondition : null })}
              />
              {r.exitCondition && <ConditionEditor label="Выйти, когда" signals={signals} value={r.exitCondition} onChange={(c) => update(i, { exitCondition: c })} readOnly={readOnly} />}
              <Group grow align="flex-start" wrap="wrap">
                <Delay label="Задержка включения" value={r.activationDelayMs} onChange={(activationDelayMs) => update(i, { activationDelayMs })} readOnly={readOnly} />
                <Delay label="Задержка выхода" value={r.releaseDelayMs} onChange={(releaseDelayMs) => update(i, { releaseDelayMs })} readOnly={readOnly} />
              </Group>
              {messages.length > 0 && (
                <Alert color="red" p="xs">
                  {messages.map((m, n) => <Text key={n} size="sm">{m}</Text>)}
                </Alert>
              )}
            </Stack>
          </Card>
        );
      })}
      {!readOnly && (
        <Group>
          <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} disabled={!signals.length || rules.length >= 20} onClick={add}>
            Добавить правило
          </Button>
        </Group>
      )}
    </Stack>
  );
}

function ConditionEditor({ label, signals, value, onChange, readOnly }: { label: string; signals: RuleSignal[]; value: Condition; onChange: (c: Condition) => void; readOnly?: boolean }) {
  const flat = flatten(value);
  if (!flat) {
    return (
      <Alert color="gray" p="xs" title={label}>
        <Text size="sm">Сложное условие (с «не» или вложенными группами). Его можно изменить во вкладке «JSON для экспертов».</Text>
      </Alert>
    );
  }
  const set = (f: FlatCondition) => onChange(unflatten(f));
  const setItem = (n: number, c: Compare) => set({ ...flat, items: flat.items.map((x, k) => (k === n ? c : x)) });
  return (
    <Stack gap={6}>
      <Group gap="xs">
        <Text size="sm" fw={600}>{label}</Text>
        {flat.items.length > 1 && (
          <SegmentedControl size="xs" disabled={readOnly} value={flat.join} onChange={(v) => set({ ...flat, join: v as FlatCondition['join'] })} data={[{ value: 'ALL', label: 'все условия' }, { value: 'ANY', label: 'любое из условий' }]} />
        )}
      </Group>
      {flat.items.map((c, n) => (
        <CompareRow key={n} signals={signals} value={c} readOnly={readOnly} onChange={(x) => setItem(n, x)} onRemove={flat.items.length > 1 ? () => set({ ...flat, items: flat.items.filter((_, k) => k !== n) }) : undefined} />
      ))}
      {!readOnly && signals[0] && flat.items.length < 10 && (
        <Group>
          <Button size="compact-xs" variant="subtle" leftSection={<IconPlus size={12} />} onClick={() => set({ ...flat, items: [...flat.items, defaultCompare(signals[0])] })}>
            Ещё условие
          </Button>
        </Group>
      )}
    </Stack>
  );
}

const parseList = (text: string, valueType: RuleSignal['valueType']) =>
  text
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (valueType === 'LONG' ? Math.trunc(Number(x)) : x))
    .filter((x) => !(typeof x === 'number' && Number.isNaN(x)));

function CompareRow({ signals, value: c, onChange, onRemove, readOnly }: { signals: RuleSignal[]; value: Compare; onChange: (c: Compare) => void; onRemove?: () => void; readOnly?: boolean }) {
  const s = signals.find((x) => x.id === c.signalId);
  const ops = s ? OPERATORS_FOR[s.valueType] : [];
  const unit = s?.unitCode ? unitLabel(s.unitCode) : '';
  const num = (v: string | number) => (v === '' ? 0 : Number(v));
  const step = s?.valueType === 'LONG' ? 1 : undefined;
  return (
    <Group gap={6} align="flex-end" wrap="wrap">
      <NativeSelect
        aria-label="Сигнал"
        w={200}
        disabled={readOnly}
        data={[...(s ? [] : [{ value: '', label: 'Сигнал не найден' }]), ...signalOptions(signals)]}
        value={s ? c.signalId : ''}
        onChange={(e) => {
          const next = signals.find((x) => x.id === e.currentTarget.value);
          if (next) onChange(defaultCompare(next, c.operator));
        }}
      />
      {s && (
        <NativeSelect
          aria-label="Оператор"
          w={170}
          disabled={readOnly}
          data={ops.map((o) => ({ value: o, label: OPERATOR[o].label }))}
          value={c.operator}
          onChange={(e) => onChange(defaultCompare(s, e.currentTarget.value as ComparisonOperator))}
        />
      )}
      {s?.valueType === 'BOOLEAN' && (
        <NativeSelect aria-label="Значение" w={90} disabled={readOnly} data={[{ value: 'true', label: 'да' }, { value: 'false', label: 'нет' }]} value={String(c.value === true)} onChange={(e) => onChange({ ...c, value: e.currentTarget.value === 'true' })} />
      )}
      {s && s.valueType !== 'BOOLEAN' && c.operator === 'BETWEEN' && (
        <>
          <NumberInput aria-label="от" placeholder="от" w={100} step={step} disabled={readOnly} value={c.lower as number} onChange={(v) => onChange({ ...c, lower: num(v) })} />
          <NumberInput aria-label="до" placeholder="до" w={100} step={step} disabled={readOnly} value={c.upper as number} onChange={(v) => onChange({ ...c, upper: num(v) })} />
        </>
      )}
      {s && c.operator === 'IN' && (
        <TextInput aria-label="Значения" placeholder="через запятую" w={200} disabled={readOnly} defaultValue={(c.values ?? []).join(', ')} onBlur={(e) => onChange({ ...c, values: parseList(e.currentTarget.value, s.valueType) })} />
      )}
      {s && (s.valueType === 'DOUBLE' || s.valueType === 'LONG') && c.operator !== 'BETWEEN' && c.operator !== 'IN' && (
        <NumberInput aria-label="Значение" w={110} step={step} disabled={readOnly} value={c.value as number} onChange={(v) => onChange({ ...c, value: num(v) })} />
      )}
      {s?.valueType === 'STRING' && c.operator !== 'IN' && (
        <TextInput aria-label="Значение" w={140} disabled={readOnly} value={String(c.value ?? '')} onChange={(e) => onChange({ ...c, value: e.currentTarget.value })} />
      )}
      {s?.valueType === 'DOUBLE' && (c.operator === 'EQ' || c.operator === 'NE') && (
        <NumberInput label={<HintLabel hint="Для дробных чисел «равно» означает «отличается не больше чем на допуск».">допуск ±</HintLabel>} w={110} min={0} disabled={readOnly} value={c.tolerance ?? DEFAULT_TOLERANCE} onChange={(v) => onChange({ ...c, tolerance: num(v) })} />
      )}
      {unit && <Text size="sm" c="dimmed" pb={6}>{unit}</Text>}
      {onRemove && !readOnly && <ActionIcon variant="subtle" color="red" aria-label="Удалить условие" mb={4} onClick={onRemove}><IconTrash size={14} /></ActionIcon>}
    </Group>
  );
}
