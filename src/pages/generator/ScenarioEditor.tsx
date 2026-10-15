import { Accordion, ActionIcon, Alert, Badge, Button, Card, Group, Modal, MultiSelect, NativeSelect, NumberInput, SegmentedControl, Select, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useEnterpriseTree } from '@/entities/enterprise';
import {
  ApiError,
  gen,
  gk,
  setup,
  type BehaviorOverride,
  type CycleMode,
  type ExpectedMachineState,
  type GenValidationIssue,
  type MachineTargetInput,
  type ScenarioCreate,
  type ScenarioPhaseInput,
  type TelemetrySignal,
} from '@/shared/api';
import { enumLabel, fieldLabel, SEVERITY, SIGNAL_KIND } from '@/shared/i18n';
import { makeCode } from '@/shared/lib';
import { BehaviorEditor, behaviorForSignalKind, defaultBehavior } from './BehaviorEditor';
import { CYCLE_MODE } from './labels';

interface Draft {
  code: string;
  name: string;
  description: string;
  cycleMode: CycleMode;
  machineTargets: MachineTargetInput[];
  phases: ScenarioPhaseInput[];
}

const EMPTY: Draft = {
  code: '',
  name: '',
  description: '',
  cycleMode: 'LOOP',
  machineTargets: [],
  phases: [{ code: 'NORMAL', name: 'Нормальная работа', durationMs: 600_000, expectedState: 'RUN', behaviorOverrides: [] }],
};

const STATES: ExpectedMachineState[] = ['RUN', 'IDLE', 'DOWN', 'SETUP', 'PLANNED_STOP', 'OFFLINE'];
const STATE_LABEL: Record<ExpectedMachineState, string> = {
  RUN: 'Работа',
  IDLE: 'Простой',
  DOWN: 'Авария',
  SETUP: 'Переналадка',
  PLANNED_STOP: 'Плановая остановка',
  OFFLINE: 'Нет данных',
};

export function toBody(d: Draft, enterpriseId: string): ScenarioCreate {
  return {
    enterpriseId,
    code: d.code || makeCode(d.name, 'SCN'),
    name: d.name,
    description: d.description.trim() || null,
    cycleMode: d.cycleMode,
    machineTargets: d.machineTargets,
    phases: d.phases,
  };
}

function Issues({ issues }: { issues: GenValidationIssue[] }) {
  if (!issues.length) return null;
  return (
    <Stack gap={4}>
      {issues.map((i, n) => (
        <Alert key={n} color={i.severity === 'ERROR' ? 'red' : 'yellow'} p="xs" title={enumLabel(SEVERITY, i.severity)}>
          <Text size="sm">{i.message}</Text>
          {i.path && (
            <Text size="xs" c="dimmed">
              {fieldLabel(i.path)}
            </Text>
          )}
        </Alert>
      ))}
    </Stack>
  );
}

export function ScenarioEditor({ scenarioId, opened, onClose }: { scenarioId: string | null; opened: boolean; onClose: () => void }) {
  const tree = useEnterpriseTree();
  const qc = useQueryClient();
  const isMobile = useMediaQuery('(max-width: 36em)');
  const enterpriseId = tree.enterprise?.id ?? '';
  const editing = scenarioId != null;
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [json, setJson] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [issues, setIssues] = useState<GenValidationIssue[] | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const detail = useQuery({ ...gen.scenario(scenarioId ?? ''), enabled: opened && editing });

  useEffect(() => {
    if (!opened) return;
    setIssues(null);
    setServerError(null);
    setMode('form');
    if (!editing) setDraft(EMPTY);
  }, [opened, editing]);

  useEffect(() => {
    const s = detail.data;
    if (!opened || !s) return;
    setDraft({ code: s.code, name: s.name, description: s.description ?? '', cycleMode: s.cycleMode, machineTargets: s.machineTargets, phases: s.phases });
  }, [opened, detail.data]);

  const targetIds = draft.machineTargets.map((t) => t.machineId);
  const signalQs = useQueries({
    queries: targetIds.map((id) => ({ queryKey: ['setup', 'signals', id], queryFn: () => setup.allSignals(id), staleTime: 60_000 })),
  });
  const signalsByMachine = useMemo(() => {
    const map = new Map<string, TelemetrySignal[]>();
    targetIds.forEach((id, i) => map.set(id, (signalQs[i].data ?? []).filter((s) => s.status === 'ACTIVE')));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalQs.map((q) => q.dataUpdatedAt).join(','), targetIds.join(',')]);
  const allSignals = [...signalsByMachine.entries()].flatMap(([machineId, list]) => list.map((s) => ({ ...s, machineId })));
  const machineName = (id: string) => tree.machines.find((m) => m.id === id)?.name ?? id;

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const setTarget = (machineId: string, fn: (t: MachineTargetInput) => MachineTargetInput) =>
    patch({ machineTargets: draft.machineTargets.map((t) => (t.machineId === machineId ? fn(t) : t)) });
  const setPhase = (i: number, p: Partial<ScenarioPhaseInput>) => patch({ phases: draft.phases.map((x, n) => (n === i ? { ...x, ...p } : x)) });
  const movePhase = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= draft.phases.length) return;
    const next = draft.phases.slice();
    [next[i], next[j]] = [next[j], next[i]];
    patch({ phases: next });
  };

  const machineOptions = tree.lines.map((l) => ({ group: l.name, items: l.machines.map((m) => ({ value: m.id, label: m.name })) }));
  const unassigned = tree.machines.filter((m) => !m.lineId);
  if (unassigned.length) machineOptions.push({ group: 'Без линии', items: unassigned.map((m) => ({ value: m.id, label: m.name })) } as never);

  const invalidate = () => qc.invalidateQueries({ queryKey: gk.scenarios });
  const body = () => toBody(draft, enterpriseId);

  const validate = useMutation({
    mutationFn: () => gen.validateScenario(body()),
    onSuccess: (r) => {
      setIssues(r.issues);
      if (r.valid) notifications.show({ color: 'green', message: r.warningCount ? `Проверка пройдена, предупреждений: ${r.warningCount}` : 'Проверка пройдена' });
    },
    onError: (e) => setServerError(e instanceof ApiError ? `${e.message}${e.fieldErrors.map((f) => `\n${f.path}: ${f.message}`).join('')}` : String(e)),
  });

  const save = useMutation({
    mutationFn: () => {
      const b = body();
      if (editing) {
        const { enterpriseId: _e, code: _c, ...update } = b;
        return gen.updateScenario(scenarioId!, update);
      }
      return gen.createScenario(b);
    },
    onSuccess: async () => {
      await invalidate();
      notifications.show({ color: 'green', message: editing ? 'Сценарий сохранён' : 'Сценарий создан отключённым — активируйте его, чтобы запускать' });
      onClose();
    },
    onError: (e) => {
      setIssues(null);
      setServerError(e instanceof ApiError ? `${e.message}${e.fieldErrors.map((f) => `\n${f.path}: ${f.message}`).join('')}` : String(e));
    },
  });

  const switchMode = (next: 'form' | 'json') => {
    if (next === 'json') {
      setJson(JSON.stringify(body(), null, 2));
      setJsonError(null);
    } else {
      try {
        const o = JSON.parse(json) as ScenarioCreate;
        setDraft({ code: editing ? draft.code : (o.code ?? ''), name: o.name ?? '', description: o.description ?? '', cycleMode: o.cycleMode ?? 'LOOP', machineTargets: o.machineTargets ?? [], phases: o.phases ?? [] });
      } catch (e) {
        setJsonError(`Некорректный JSON: ${(e as Error).message}`);
        return;
      }
    }
    setMode(next);
  };

  const fillDefaults = (machineId: string) =>
    setTarget(machineId, (t) => {
      const have = new Set(t.baseBehaviors.map((b) => b.signalId));
      const add = (signalsByMachine.get(machineId) ?? []).filter((s) => !have.has(s.id)).map((s) => ({ signalId: s.id, behavior: behaviorForSignalKind(s.signalKind) }));
      return { ...t, baseBehaviors: [...t.baseBehaviors, ...add] };
    });

  const signalLabel = (s: { code: string; name: string; machineId: string }) => `${machineName(s.machineId)} · ${s.name} (${s.code})`;

  return (
    <Modal opened={opened} onClose={onClose} size="xl" fullScreen={isMobile} title={editing ? 'Редактирование сценария' : 'Новый сценарий'} closeOnClickOutside={false}>
      <Stack gap="md">
        <Group justify="space-between">
          <SegmentedControl size="xs" value={mode} onChange={(v) => switchMode(v as 'form' | 'json')} data={[{ value: 'form', label: 'Форма' }, { value: 'json', label: 'JSON' }]} />
          {editing && detail.isLoading && <Text size="sm" c="dimmed">Загрузка…</Text>}
        </Group>

        {mode === 'json' ? (
          <Stack gap={4}>
            <Textarea autosize minRows={14} maxRows={28} ff="monospace" value={json} onChange={(e) => setJson(e.currentTarget.value)} error={jsonError} />
            <Text size="xs" c="dimmed">Полное тело запроса. При возврате в «Форму» JSON будет разобран.</Text>
          </Stack>
        ) : (
          <>
            <Group grow align="flex-start">
              <TextInput label={editing ? 'Код' : 'Код (необязательно)'} description={editing ? 'После создания не меняется' : 'Пусто — создастся из названия'} placeholder={editing ? undefined : makeCode(draft.name, 'SCN')} disabled={editing} ff="monospace" value={draft.code} onChange={(e) => patch({ code: e.currentTarget.value.toUpperCase() })} />
              <TextInput label="Название" required value={draft.name} onChange={(e) => patch({ name: e.currentTarget.value })} />
              <NativeSelect label="Повтор фаз" value={draft.cycleMode} data={Object.entries(CYCLE_MODE).map(([value, label]) => ({ value, label }))} onChange={(e) => patch({ cycleMode: e.currentTarget.value as CycleMode })} />
            </Group>
            <Textarea label="Описание" autosize minRows={1} value={draft.description} onChange={(e) => patch({ description: e.currentTarget.value })} />

            <Stack gap={6}>
              <Text fw={600}>Машины и базовое поведение сигналов</Text>
              <MultiSelect
                searchable
                placeholder="Выберите машины (до 20)"
                data={machineOptions}
                value={targetIds}
                maxValues={20}
                onChange={(ids) =>
                  patch({ machineTargets: ids.map((id) => draft.machineTargets.find((t) => t.machineId === id) ?? { machineId: id, baseBehaviors: [] }) })
                }
              />
              <Accordion multiple variant="separated" chevronPosition="left">
                {draft.machineTargets.map((t) => {
                  const signals = signalsByMachine.get(t.machineId) ?? [];
                  return (
                    <Accordion.Item key={t.machineId} value={t.machineId}>
                      <Accordion.Control>
                        <Group gap="xs">
                          <Text size="sm" fw={500}>{machineName(t.machineId)}</Text>
                          <Badge variant="light">{t.baseBehaviors.length} / {signals.length} сигналов</Badge>
                        </Group>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <Stack gap="xs">
                          <Group>
                            <Button size="compact-xs" variant="light" onClick={() => fillDefaults(t.machineId)} disabled={!signals.length}>
                              Заполнить типовыми
                            </Button>
                            <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setTarget(t.machineId, (x) => ({ ...x, baseBehaviors: [] }))}>
                              Очистить
                            </Button>
                          </Group>
                          {signals.map((s) => {
                            const bb = t.baseBehaviors.find((b) => b.signalId === s.id);
                            return (
                              <Card key={s.id} withBorder padding="xs">
                                <Switch
                                  size="xs"
                                  label={`${s.name} (${s.code}) · ${enumLabel(SIGNAL_KIND, s.signalKind)}${s.unitCode ? ` · ${s.unitCode}` : ''}`}
                                  checked={!!bb}
                                  onChange={(e) =>
                                    setTarget(t.machineId, (x) => ({
                                      ...x,
                                      baseBehaviors: e.currentTarget.checked ? [...x.baseBehaviors, { signalId: s.id, behavior: behaviorForSignalKind(s.signalKind) }] : x.baseBehaviors.filter((b) => b.signalId !== s.id),
                                    }))
                                  }
                                />
                                {bb && (
                                  <BehaviorEditor
                                    value={bb.behavior}
                                    onChange={(behavior) => setTarget(t.machineId, (x) => ({ ...x, baseBehaviors: x.baseBehaviors.map((b) => (b.signalId === s.id ? { ...b, behavior } : b)) }))}
                                  />
                                )}
                              </Card>
                            );
                          })}
                          {!signals.length && <Text size="sm" c="dimmed">У машины нет активных сигналов</Text>}
                        </Stack>
                      </Accordion.Panel>
                    </Accordion.Item>
                  );
                })}
              </Accordion>
            </Stack>

            <Stack gap={6}>
              <Group justify="space-between">
                <Text fw={600}>Фазы ({draft.phases.length})</Text>
                <Button size="compact-sm" leftSection={<IconPlus size={14} />} variant="light" disabled={draft.phases.length >= 20}
                  onClick={() => patch({ phases: [...draft.phases, { code: `PHASE_${draft.phases.length + 1}`, name: `Фаза ${draft.phases.length + 1}`, durationMs: 300_000, expectedState: 'RUN', behaviorOverrides: [] }] })}>
                  Добавить фазу
                </Button>
              </Group>
              {draft.phases.map((p, i) => (
                <Card key={i} withBorder padding="sm">
                  <Stack gap="xs">
                    <Group align="flex-end" wrap="wrap">
                      <TextInput size="xs" label="Код" w={140} value={p.code} onChange={(e) => setPhase(i, { code: e.currentTarget.value.toUpperCase() })} />
                      <TextInput size="xs" label="Название" style={{ flex: 1, minWidth: 140 }} value={p.name} onChange={(e) => setPhase(i, { name: e.currentTarget.value })} />
                      <NumberInput size="xs" label="Длительность, сек" w={130} min={1} value={p.durationMs / 1000} onChange={(v) => setPhase(i, { durationMs: Math.round(Number(v || 0) * 1000) })} />
                      <Select size="xs" label="Ожидаемое состояние" w={170} clearable value={p.expectedState ?? null} data={STATES.map((s) => ({ value: s, label: STATE_LABEL[s] }))} onChange={(v) => setPhase(i, { expectedState: (v as ExpectedMachineState) ?? undefined })} />
                      <Group gap={2}>
                        <ActionIcon variant="subtle" onClick={() => movePhase(i, -1)} disabled={i === 0} aria-label="Вверх"><IconArrowUp size={16} /></ActionIcon>
                        <ActionIcon variant="subtle" onClick={() => movePhase(i, 1)} disabled={i === draft.phases.length - 1} aria-label="Вниз"><IconArrowDown size={16} /></ActionIcon>
                        <ActionIcon variant="subtle" color="red" onClick={() => patch({ phases: draft.phases.filter((_, n) => n !== i) })} disabled={draft.phases.length === 1} aria-label="Удалить фазу"><IconTrash size={16} /></ActionIcon>
                      </Group>
                    </Group>
                    <OverrideList
                      overrides={p.behaviorOverrides}
                      signals={allSignals}
                      label={signalLabel}
                      onChange={(behaviorOverrides) => setPhase(i, { behaviorOverrides })}
                    />
                  </Stack>
                </Card>
              ))}
            </Stack>
          </>
        )}

        {serverError && <Alert color="red" title="Ошибка"><Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{serverError}</Text></Alert>}
        {issues && (issues.length ? <Issues issues={issues} /> : <Alert color="green" p="xs">Замечаний нет</Alert>)}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Отмена</Button>
          <Button variant="light" loading={validate.isPending} disabled={mode === 'json'} onClick={() => { setServerError(null); validate.mutate(); }}>
            Проверить
          </Button>
          <Button
            loading={save.isPending}
            disabled={mode === 'json' || !draft.name.trim() || (!editing && !draft.code)}
            onClick={() => { setServerError(null); save.mutate(); }}
          >
            {editing ? 'Сохранить' : 'Создать'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function OverrideList({
  overrides,
  signals,
  label,
  onChange,
}: {
  overrides: BehaviorOverride[];
  signals: Array<TelemetrySignal & { machineId: string }>;
  label: (s: { code: string; name: string; machineId: string }) => string;
  onChange: (o: BehaviorOverride[]) => void;
}) {
  const options = signals.map((s) => ({ value: s.id, label: label(s) }));
  const kindOf = (id: string) => signals.find((s) => s.id === id)?.signalKind ?? 'GAUGE';
  const set = (i: number, o: BehaviorOverride) => onChange(overrides.map((x, n) => (n === i ? o : x)));
  return (
    <Stack gap={6}>
      {overrides.map((o, i) => (
        <Card key={i} withBorder padding="xs" bg="var(--mantine-color-default-hover)">
          <Group align="flex-end" wrap="wrap" mb={o.action === 'REPLACE' ? 6 : 0}>
            <Select size="xs" label="Сигнал" searchable style={{ flex: 1, minWidth: 220 }} data={options} value={o.signalId} onChange={(v) => v && set(i, { ...o, signalId: v })} />
            <NativeSelect
              size="xs"
              label="Действие"
              value={o.action}
              data={[{ value: 'REPLACE', label: 'Заменить поведение' }, { value: 'DISABLE', label: 'Отключить сигнал' }]}
              onChange={(e) =>
                set(i, e.currentTarget.value === 'DISABLE' ? { signalId: o.signalId, action: 'DISABLE' } : { signalId: o.signalId, action: 'REPLACE', behavior: behaviorForSignalKind(kindOf(o.signalId)) })
              }
            />
            <ActionIcon variant="subtle" color="red" onClick={() => onChange(overrides.filter((_, n) => n !== i))} aria-label="Убрать"><IconTrash size={16} /></ActionIcon>
          </Group>
          {o.action === 'REPLACE' && <BehaviorEditor value={o.behavior} onChange={(behavior) => set(i, { ...o, behavior })} />}
        </Card>
      ))}
      <Button
        size="compact-xs"
        variant="subtle"
        w="fit-content"
        leftSection={<IconPlus size={12} />}
        disabled={!signals.length}
        onClick={() => onChange([...overrides, { signalId: signals[0].id, action: 'REPLACE', behavior: defaultBehavior('NORMAL') }])}
      >
        Переопределить сигнал в фазе
      </Button>
    </Stack>
  );
}
