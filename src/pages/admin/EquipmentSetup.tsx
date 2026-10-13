import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  List,
  MultiSelect,
  NativeSelect,
  NumberInput,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { rateUnitError, unitOptions } from './units';
import { ApiError, formatApiError, setup, type ComponentKind, type MachineStateConfigurationInput, type SignalKind, type SignalValueType, type ValidationIssue } from '@/shared/api';

export const DRAFT_KEY = 'fkit-bi-setup-draft';

export const COMPONENT_KINDS: ComponentKind[] = ['LOGICAL_GROUP', 'ASSEMBLY', 'MODULE', 'MECHANISM', 'MOTOR', 'DRIVE', 'GEARBOX', 'SPINDLE', 'BEARING', 'COUPLING', 'ACTUATOR', 'PUMP', 'COMPRESSOR', 'FAN', 'BLOWER', 'VALVE', 'HEATER', 'COOLER', 'MIXER', 'DOSER', 'CONVEYOR', 'FEEDER', 'ROBOT', 'MANIPULATOR', 'TOOL', 'FIXTURE', 'SENSOR', 'INSTRUMENT', 'CONTROLLER', 'SAFETY_DEVICE', 'POWER_SUPPLY', 'LUBRICATION_SYSTEM', 'HYDRAULIC_SYSTEM', 'PNEUMATIC_SYSTEM', 'COOLING_SYSTEM', 'OTHER'];
export const SIGNAL_SEMANTICS = ['TEMPERATURE', 'PRESSURE', 'FLOW_RATE', 'LEVEL', 'HUMIDITY', 'ROTATIONAL_SPEED', 'LINEAR_SPEED', 'VIBRATION', 'VOLTAGE', 'CURRENT', 'POWER', 'ENERGY', 'TORQUE', 'FORCE', 'POSITION', 'DISTANCE', 'PRODUCTION_COUNT', 'SCRAP_COUNT', 'CYCLE_COUNT', 'OPERATING_FLAG', 'READY_FLAG', 'ALARM_FLAG', 'MACHINE_MODE', 'QUALITY_CODE', 'LOAD_PERCENT', 'CUSTOM'];
const TIMEZONES = ['Europe/Moscow', 'Europe/Kaliningrad', 'Asia/Yekaterinburg', 'Asia/Novosibirsk', 'Asia/Vladivostok'];
const NUMERIC = ['DOUBLE', 'LONG'];

interface Draft {
  enterpriseId: string;
  machineId: string;
  enterpriseName: string;
  enterpriseCode: string;
  timezone: string;
  lineCode: string;
  lineName: string;
  machineLineId: string;
  machineCode: string;
  machineName: string;
  nominalRate: string;
  productionUnit: string;
  assignmentIds: string[];
  componentParentId: string;
  componentCode: string;
  componentName: string;
  componentKind: string;
  signalComponentId: string;
  signalCode: string;
  signalName: string;
  valueType: string;
  signalKind: string;
  semanticCode: string;
  unitCode: string;
  defaultState: string;
  offlineAfterMs: string;
  stateRules: string;
}

const EMPTY: Draft = {
  enterpriseId: '',
  machineId: '',
  enterpriseName: '',
  enterpriseCode: '',
  timezone: 'Europe/Moscow',
  lineCode: '',
  lineName: '',
  machineLineId: '',
  machineCode: '',
  machineName: '',
  nominalRate: '',
  productionUnit: '',
  assignmentIds: [],
  componentParentId: '',
  componentCode: '',
  componentName: '',
  componentKind: 'OTHER',
  signalComponentId: '',
  signalCode: '',
  signalName: '',
  valueType: 'DOUBLE',
  signalKind: 'GAUGE',
  semanticCode: 'TEMPERATURE',
  unitCode: '',
  defaultState: 'IDLE',
  offlineAfterMs: '60000',
  stateRules: '[]',
};

function loadDraft(): Draft {
  try {
    return { ...EMPTY, ...(JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}') as Partial<Draft>) };
  } catch {
    return EMPTY;
  }
}

export function errorMessage(error: unknown) {
  return formatApiError(error);
}

const upper = (v: string) => v.toUpperCase();
const CODE_PATTERN = '[A-Z][A-Z0-9_]{0,63}';

function Section({ id, step, title, hint, children }: { id: string; step: string; title: string; hint: string; children: ReactNode }) {
  return (
    <Paper id={id} p="md" radius="sm" style={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-border)' }}>
      <Group gap="sm" align="flex-start" mb="sm" wrap="nowrap">
        <Badge size="lg" variant="light" radius="sm">
          {step}
        </Badge>
        <div>
          <Title order={2} fz="lg">
            {title}
          </Title>
          <Text size="sm" c="dimmed">
            {hint}
          </Text>
        </div>
      </Group>
      {children}
    </Paper>
  );
}

export function EquipmentSetup() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<ValidationIssue[]>([]);
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  useEffect(() => sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)), [draft]);

  const enterprises = useQuery({ queryKey: ['setup', 'enterprises'], queryFn: setup.enterprises });
  const units = useQuery({ queryKey: ['setup', 'measurement-units'], queryFn: setup.measurementUnits, staleTime: Infinity });
  const lines = useQuery({ queryKey: ['setup', 'lines', draft.enterpriseId], queryFn: () => setup.lines(draft.enterpriseId), enabled: !!draft.enterpriseId });
  const machines = useQuery({ queryKey: ['setup', 'machines', draft.enterpriseId], queryFn: () => setup.machines(draft.enterpriseId), enabled: !!draft.enterpriseId });
  const components = useQuery({ queryKey: ['setup', 'components', draft.machineId], queryFn: () => setup.components(draft.machineId), enabled: !!draft.machineId });
  const signals = useQuery({ queryKey: ['setup', 'signals', draft.machineId], queryFn: () => setup.signals(draft.machineId), enabled: !!draft.machineId });
  const readiness = useQuery({ queryKey: ['setup', 'readiness', draft.machineId], queryFn: () => setup.readiness(draft.machineId), enabled: !!draft.machineId });

  useEffect(() => {
    if (!draft.enterpriseId && enterprises.data?.[0]) patch({ enterpriseId: enterprises.data[0].id });
  }, [enterprises.data, draft.enterpriseId]);
  useEffect(() => {
    if (machines.data && !machines.data.some((m) => m.id === draft.machineId)) patch({ machineId: machines.data[0]?.id ?? '' });
  }, [machines.data, draft.machineId]);

  const loadError = [enterprises, units, lines, machines, components, signals, readiness].find((q) => q.error)?.error;
  const selectedMachine = machines.data?.find((m) => m.id === draft.machineId);
  const unassigned = (machines.data ?? []).filter((m) => !m.lineId);

  const run = useMutation({
    mutationFn: async ({ work }: { work: () => Promise<unknown>; success?: string; invalidate?: string[] }) => work(),
    onMutate: () => {
      setNotice(null);
      setFieldErrors({});
    },
    onSuccess: async (_r, v) => {
      if (v.success) setNotice({ kind: 'success', text: v.success });
      await Promise.all((v.invalidate ?? []).map((k) => qc.invalidateQueries({ queryKey: ['setup', k] })));
      await qc.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 401) {
        setNotice({ kind: 'error', text: 'Сессия истекла. Войдите снова, введённые данные сохранены.' });
        return;
      }
      setNotice({ kind: 'error', text: errorMessage(e) });
      if (e instanceof ApiError) setFieldErrors(Object.fromEntries(e.fieldErrors.map((f) => [f.path, f.message])));
    },
  });
  const busy = run.isPending;
  const act = (work: () => Promise<unknown>, success: string, invalidate: string[], after?: (r: unknown) => void) =>
    run.mutate({ work, success, invalidate }, { onSuccess: (r) => after?.(r) });

  const submit = (fn: () => void) => (e: FormEvent) => {
    e.preventDefault();
    fn();
  };

  const stateConfig = (): MachineStateConfigurationInput => ({
    defaultState: draft.defaultState as MachineStateConfigurationInput['defaultState'],
    offlineAfterMs: Number(draft.offlineAfterMs),
    rules: JSON.parse(draft.stateRules) as MachineStateConfigurationInput['rules'],
  });

  const addExampleRule = () => {
    const signal = signals.data?.[0];
    if (!signal) {
      setNotice({ kind: 'error', text: 'Сначала добавьте сигнал для условия правила.' });
      return;
    }
    try {
      const current = JSON.parse(draft.stateRules) as unknown;
      if (!Array.isArray(current)) throw new Error('ожидается массив');
      const numeric = NUMERIC.includes(signal.valueType);
      const compare = { type: 'COMPARE', signalId: signal.id, operator: numeric ? 'GT' : 'EQ', value: numeric ? 0 : signal.valueType === 'BOOLEAN' ? true : '' };
      patch({ stateRules: JSON.stringify([...current, { name: 'Работа', priority: 10, targetState: 'RUN', enterCondition: compare, activationDelayMs: 0, releaseDelayMs: 0 }], null, 2) });
      setNotice(null);
    } catch {
      setNotice({ kind: 'error', text: 'Rules должны быть JSON массивом.' });
    }
  };

  const withConfig = (fn: (cfg: MachineStateConfigurationInput) => void) => {
    try {
      fn(stateConfig());
    } catch (e) {
      setNotice({ kind: 'error', text: `Проверьте JSON правил: ${errorMessage(e)}` });
    }
  };

  const validateState = () =>
    withConfig((cfg) =>
      run.mutate(
        { work: () => setup.validateState(draft.machineId, cfg), success: 'Проверка завершена.' },
        {
          onSuccess: (r) => {
            const v = r as Awaited<ReturnType<typeof setup.validateState>>;
            setValidation(v.errors.length ? v.errors : v.warnings);
            if (!v.valid) setNotice({ kind: 'error', text: 'Исправьте ошибки конфигурации состояния.' });
          },
        },
      ),
    );

  const saveState = () =>
    withConfig((cfg) =>
      act(
        async () => {
          const checked = await setup.validateState(draft.machineId, cfg);
          setValidation(checked.errors.length ? checked.errors : checked.warnings);
          if (!checked.valid) throw new Error('Исправьте ошибки конфигурации состояния.');
          return setup.saveState(draft.machineId, cfg);
        },
        'Правила состояния сохранены.',
        ['readiness'],
      ),
    );

  const fe = (path: string) => fieldErrors[path];
  const machinePairError = rateUnitError(draft.nominalRate, draft.productionUnit);

  return (
    <Stack gap="sm" maw={1100} mx="auto" w="100%">
      <Group justify="space-between" align="flex-end">
        <div>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">
            Конфигурация · Epic 2
          </Text>
          <Title order={1} fz="h2">
            Подготовьте оборудование
          </Title>
          <Text size="sm" c="dimmed">
            Сохраняйте каждый раздел отдельно. Машина активируется после проверки готовности.
          </Text>
        </div>
        <Badge size="lg" variant="outline">
          {selectedMachine?.status ?? 'НЕТ МАШИНЫ'}
        </Badge>
      </Group>

      {loadError != null && !notice && <Alert color="red">{errorMessage(loadError)}</Alert>}
      {notice && (
        <Alert color={notice.kind === 'error' ? 'red' : 'green'} role="status">
          {notice.text}
        </Alert>
      )}
      {Object.keys(fieldErrors).length > 0 && (
        <Alert color="red" role="alert" title="Исправьте поля:">
          <List size="sm">
            {Object.entries(fieldErrors).map(([path, message]) => (
              <List.Item key={path}>
                <Code>{path}</Code> — {message}
              </List.Item>
            ))}
          </List>
        </Alert>
      )}

      <Section id="enterprise" step="01" title="Предприятие" hint="Часовой пояс используется для сменного календаря.">
        <Stack gap="sm">
          <NativeSelect
            label="Текущее предприятие"
            value={draft.enterpriseId}
            onChange={(e) => patch({ enterpriseId: e.currentTarget.value, machineId: '' })}
            data={[{ value: '', label: 'Выберите предприятие' }, ...(enterprises.data ?? []).map((e) => ({ value: e.id, label: `${e.name} · ${e.code}` }))]}
          />
          <form
            onSubmit={submit(() =>
              act(
                () => setup.createEnterprise({ code: draft.enterpriseCode, name: draft.enterpriseName, timezone: draft.timezone }),
                'Предприятие создано.',
                ['enterprises'],
                (r) => patch({ enterpriseCode: '', enterpriseName: '', enterpriseId: (r as { id: string }).id, machineId: '' }),
              ),
            )}
          >
            <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="sm" verticalSpacing="sm">
              <TextInput label="Код" required pattern={CODE_PATTERN} placeholder="PLANT_01" value={draft.enterpriseCode} error={fe('code')} onChange={(e) => patch({ enterpriseCode: upper(e.currentTarget.value) })} />
              <TextInput label="Название" required maxLength={200} value={draft.enterpriseName} error={fe('name')} onChange={(e) => patch({ enterpriseName: e.currentTarget.value })} />
              <NativeSelect label="Часовой пояс" data={TIMEZONES} value={draft.timezone} onChange={(e) => patch({ timezone: e.currentTarget.value })} />
              <Button type="submit" disabled={busy} mt={{ sm: 24 }}>
                Создать предприятие
              </Button>
            </SimpleGrid>
          </form>
        </Stack>
      </Section>

      <Section id="lines" step="02" title="Линии и машины" hint="Машины создаются отключёнными и назначаются линии один раз.">
        {!draft.enterpriseId ? (
          <Text c="dimmed">Сначала выберите предприятие.</Text>
        ) : (
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              <form
                onSubmit={submit(() =>
                  act(() => setup.createLine(draft.enterpriseId, { code: draft.lineCode, name: draft.lineName }), 'Линия создана.', ['lines'], () =>
                    patch({ lineCode: '', lineName: '' }),
                  ),
                )}
              >
                <Stack gap="xs">
                  <Title order={3} fz="md">
                    Новая линия
                  </Title>
                  <TextInput label="Код" required pattern={CODE_PATTERN} value={draft.lineCode} onChange={(e) => patch({ lineCode: upper(e.currentTarget.value) })} />
                  <TextInput label="Название" required maxLength={200} value={draft.lineName} onChange={(e) => patch({ lineName: e.currentTarget.value })} />
                  <Button type="submit" disabled={busy}>
                    Добавить линию
                  </Button>
                </Stack>
              </form>
              <form
                onSubmit={submit(() =>
                  act(
                    () =>
                      setup.createMachine(draft.enterpriseId, {
                        code: draft.machineCode,
                        name: draft.machineName,
                        lineId: draft.machineLineId || null,
                        nominalRate: draft.nominalRate ? Number(draft.nominalRate) : null,
                        productionUnit: draft.productionUnit || null,
                        parameters: [],
                      }),
                    'Машина создана в статусе DISABLED.',
                    ['machines'],
                    (r) => patch({ machineCode: '', machineName: '', machineId: (r as { id: string }).id }),
                  ),
                )}
              >
                <Stack gap="xs">
                  <Title order={3} fz="md">
                    Новая машина
                  </Title>
                  <NativeSelect
                    label="Линия"
                    value={draft.machineLineId}
                    onChange={(e) => patch({ machineLineId: e.currentTarget.value })}
                    data={[{ value: '', label: 'Без линии' }, ...(lines.data ?? []).map((l) => ({ value: l.id, label: l.name }))]}
                  />
                  <TextInput label="Код" required pattern={CODE_PATTERN} value={draft.machineCode} onChange={(e) => patch({ machineCode: upper(e.currentTarget.value) })} />
                  <TextInput label="Название" required maxLength={200} value={draft.machineName} onChange={(e) => patch({ machineName: e.currentTarget.value })} />
                  <SimpleGrid cols={2} spacing="xs">
                    <NumberInput label="Норма выпуска" min={0} decimalScale={6} value={draft.nominalRate} error={machinePairError.nominalRate ?? fe('nominalRate')} onChange={(v) => patch({ nominalRate: String(v ?? '') })} />
                    <NativeSelect label="Единица выпуска" value={draft.productionUnit} error={machinePairError.productionUnit ?? fe('productionUnit')} data={unitOptions(units.data ?? [], draft.productionUnit, 'Не выбрана')} onChange={(e) => patch({ productionUnit: e.currentTarget.value })} />
                  </SimpleGrid>
                  <Button type="submit" disabled={busy || !!machinePairError.nominalRate || !!machinePairError.productionUnit}>
                    Создать DISABLED
                  </Button>
                </Stack>
              </form>
            </SimpleGrid>
            <form
              onSubmit={submit(() => {
                if (!draft.machineLineId || !draft.assignmentIds.length) return;
                act(() => setup.assign(draft.machineLineId, draft.assignmentIds), 'Машины назначены линии.', ['machines'], () => patch({ assignmentIds: [] }));
              })}
            >
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                <MultiSelect
                  label="Назначить свободные машины"
                  value={draft.assignmentIds}
                  onChange={(v) => patch({ assignmentIds: v })}
                  data={unassigned.map((m) => ({ value: m.id, label: `${m.name} · ${m.code}` }))}
                />
                <NativeSelect
                  label="В линию"
                  value={draft.machineLineId}
                  onChange={(e) => patch({ machineLineId: e.currentTarget.value })}
                  data={[{ value: '', label: 'Выберите линию' }, ...(lines.data ?? []).map((l) => ({ value: l.id, label: l.name }))]}
                />
                <Button type="submit" disabled={busy || !draft.assignmentIds.length || !draft.machineLineId} mt={{ sm: 24 }}>
                  Назначить выбранные
                </Button>
              </SimpleGrid>
            </form>
            <NativeSelect
              label="Настраиваемая машина"
              value={draft.machineId}
              onChange={(e) => patch({ machineId: e.currentTarget.value })}
              data={[{ value: '', label: 'Выберите машину' }, ...(machines.data ?? []).map((m) => ({ value: m.id, label: `${m.name} · ${m.code} (${m.status})` }))]}
            />
          </Stack>
        )}
      </Section>

      {selectedMachine && (
        <>
          <Section id="machine" step="03" title="Компоненты и сигналы" hint="Каждый объект сохраняется отдельным запросом; ссылки ограничены этой машиной.">
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              <form
                onSubmit={submit(() =>
                  act(
                    () =>
                      setup.createComponent(draft.machineId, {
                        parentComponentId: draft.componentParentId || null,
                        code: draft.componentCode,
                        name: draft.componentName,
                        kind: draft.componentKind as ComponentKind,
                        sortOrder: (components.data?.length ?? 0) * 10,
                        parameters: [],
                      }),
                    'Компонент создан.',
                    ['components'],
                    () => patch({ componentCode: '', componentName: '' }),
                  ),
                )}
              >
                <Stack gap="xs">
                  <Title order={3} fz="md">
                    Компонент
                  </Title>
                  <NativeSelect
                    label="Родитель"
                    value={draft.componentParentId}
                    onChange={(e) => patch({ componentParentId: e.currentTarget.value })}
                    data={[{ value: '', label: 'Корневой компонент' }, ...(components.data ?? []).map((c) => ({ value: c.id, label: `${c.name} · ${c.code}` }))]}
                  />
                  <TextInput label="Код" required pattern={CODE_PATTERN} value={draft.componentCode} onChange={(e) => patch({ componentCode: upper(e.currentTarget.value) })} />
                  <TextInput label="Название" required maxLength={200} value={draft.componentName} onChange={(e) => patch({ componentName: e.currentTarget.value })} />
                  <NativeSelect label="Вид" data={COMPONENT_KINDS} value={draft.componentKind} onChange={(e) => patch({ componentKind: e.currentTarget.value })} />
                  <Button type="submit" disabled={busy}>
                    Добавить компонент
                  </Button>
                </Stack>
              </form>
              <form
                onSubmit={submit(() =>
                  act(
                    () =>
                      setup.createSignal(draft.machineId, {
                        componentId: draft.signalComponentId || null,
                        code: draft.signalCode,
                        name: draft.signalName,
                        valueType: draft.valueType as SignalValueType,
                        signalKind: draft.signalKind as SignalKind,
                        semanticCode: draft.semanticCode,
                        customSemanticCode: draft.semanticCode === 'CUSTOM' ? 'CUSTOM_VALUE' : null,
                        unitCode: NUMERIC.includes(draft.valueType) ? draft.unitCode || null : null,
                        staleAfterMs: 60000,
                        featured: true,
                      }),
                    'Сигнал создан.',
                    ['signals', 'readiness'],
                    () => patch({ signalCode: '', signalName: '' }),
                  ),
                )}
              >
                <Stack gap="xs">
                  <Title order={3} fz="md">
                    Сигнал
                  </Title>
                  <NativeSelect
                    label="Компонент"
                    value={draft.signalComponentId}
                    onChange={(e) => patch({ signalComponentId: e.currentTarget.value })}
                    data={[{ value: '', label: 'Уровень машины' }, ...(components.data ?? []).map((c) => ({ value: c.id, label: `${c.name} · ${c.code}` }))]}
                  />
                  <TextInput label="Код" required pattern={CODE_PATTERN} value={draft.signalCode} onChange={(e) => patch({ signalCode: upper(e.currentTarget.value) })} />
                  <TextInput label="Название" required maxLength={200} value={draft.signalName} onChange={(e) => patch({ signalName: e.currentTarget.value })} />
                  <SimpleGrid cols={2} spacing="xs">
                    <NativeSelect
                      label="Тип"
                      data={['DOUBLE', 'LONG', 'BOOLEAN', 'STRING']}
                      value={draft.valueType}
                      onChange={(e) => {
                        const v = e.currentTarget.value;
                        patch(NUMERIC.includes(v) ? { valueType: v } : { valueType: v, signalKind: 'STATE', unitCode: '' });
                      }}
                    />
                    <NativeSelect
                      label="Последовательность"
                      data={NUMERIC.includes(draft.valueType) ? ['GAUGE', 'COUNTER', 'STATE'] : ['STATE']}
                      value={draft.signalKind}
                      onChange={(e) => patch({ signalKind: e.currentTarget.value })}
                    />
                    <NativeSelect label="Семантика" data={SIGNAL_SEMANTICS} value={draft.semanticCode} onChange={(e) => patch({ semanticCode: e.currentTarget.value })} />
                    <NativeSelect
                      label="Единица"
                      disabled={!NUMERIC.includes(draft.valueType)}
                      value={draft.unitCode}
                      data={unitOptions(units.data ?? [], draft.unitCode, 'Без единицы')}
                      onChange={(e) => patch({ unitCode: e.currentTarget.value })}
                    />
                  </SimpleGrid>
                  <Button type="submit" disabled={busy}>
                    Добавить сигнал
                  </Button>
                </Stack>
              </form>
            </SimpleGrid>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mt="md">
              <div>
                <Title order={3} fz="md" mb={4}>
                  Компоненты
                </Title>
                {components.data?.length ? (
                  components.data.map((c) => (
                    <Group key={c.id} justify="space-between" py={2}>
                      <Text size="sm">{c.name}</Text>
                      <Code>{c.code}</Code>
                    </Group>
                  ))
                ) : (
                  <Text size="sm" c="dimmed">
                    Компонентов пока нет.
                  </Text>
                )}
              </div>
              <div>
                <Title order={3} fz="md" mb={4}>
                  Сигналы
                </Title>
                {signals.data?.length ? (
                  signals.data.map((s) => (
                    <Group key={s.id} justify="space-between" py={2} wrap="nowrap">
                      <div>
                        <Text size="sm">{s.name}</Text>
                        <Text size="xs" c="dimmed">
                          {s.semanticCode} · {s.valueType}
                        </Text>
                      </div>
                      <Code>{s.code}</Code>
                    </Group>
                  ))
                ) : (
                  <Text size="sm" c="dimmed">
                    Сигналов пока нет.
                  </Text>
                )}
              </div>
            </SimpleGrid>
          </Section>

          <Section id="state" step="04" title="Правила состояния" hint="Введите декларативные AST-правила. Проверка не сохраняет документ.">
            <Stack gap="sm">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <NativeSelect label="Состояние по умолчанию" data={['IDLE', 'RUN', 'DOWN', 'SETUP', 'PLANNED_STOP']} value={draft.defaultState} onChange={(e) => patch({ defaultState: e.currentTarget.value })} />
                <NumberInput label="Offline после, мс" min={1} value={draft.offlineAfterMs} onChange={(v) => patch({ offlineAfterMs: String(v ?? '') })} />
              </SimpleGrid>
              <Textarea
                label="Rules — JSON массив"
                autosize
                minRows={8}
                maxRows={24}
                spellCheck={false}
                styles={{ input: { fontFamily: 'ui-monospace, monospace', fontSize: 12 } }}
                value={draft.stateRules}
                onChange={(e) => patch({ stateRules: e.currentTarget.value })}
              />
              <Group gap="xs">
                <Button variant="default" disabled={busy || !signals.data?.length} onClick={addExampleRule}>
                  Добавить пример правила
                </Button>
                <Button variant="default" disabled={busy} onClick={validateState}>
                  Проверить без сохранения
                </Button>
                <Button disabled={busy} onClick={saveState}>
                  Сохранить правила
                </Button>
              </Group>
              {validation.length > 0 && (
                <Alert color="yellow" title="Результат проверки">
                  {validation.map((x, i) => (
                    <Text key={`${x.code}-${i}`} size="sm">
                      <Code>{x.code}</Code> {x.path && <Text span size="xs" c="dimmed">{x.path}: </Text>}
                      {x.message}
                    </Text>
                  ))}
                </Alert>
              )}
              <Group justify="space-between" align="center">
                <div>
                  <Title order={3} fz="md">
                    Готовность к активации
                  </Title>
                  <Text size="sm" c="dimmed">
                    {readiness.data ? (readiness.data.ready ? 'Все обязательные проверки пройдены.' : 'Есть обязательные проверки для исправления.') : 'Проверка ещё не выполнялась.'}
                  </Text>
                </div>
                <Button
                  color="green"
                  disabled={busy || !readiness.data?.ready || selectedMachine.status === 'ACTIVE'}
                  onClick={() => act(() => setup.setMachineStatus(draft.machineId, 'ACTIVE'), 'Машина активирована.', ['machines', 'readiness'])}
                >
                  Активировать машину
                </Button>
              </Group>
              {readiness.data && (readiness.data.errors.length > 0 || readiness.data.warnings.length > 0) && (
                <Stack gap={2}>
                  {[...readiness.data.errors.map((x) => ({ ...x, level: 'Ошибка' })), ...readiness.data.warnings.map((x) => ({ ...x, level: 'Предупреждение' }))].map((x, i) => (
                    <Text key={`${x.code}-${i}`} size="sm">
                      <b>{x.level}:</b> <Code>{x.code}</Code> {x.message}
                    </Text>
                  ))}
                </Stack>
              )}
            </Stack>
          </Section>
        </>
      )}
      <Text size="xs" c="dimmed">
        Состояние форм сохраняется в этой вкладке. При конфликте исправьте поля и отправьте запрос повторно.
      </Text>
    </Stack>
  );
}
