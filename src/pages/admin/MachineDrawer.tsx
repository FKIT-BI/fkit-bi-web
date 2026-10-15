import { ActionIcon, Alert, Badge, Button, Checkbox, Drawer, Group, List, NativeSelect, NumberInput, SimpleGrid, Stack, Table, Tabs, Text, Textarea, TextInput, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, setup, type Component, type ConfigStatus, type MachineStateConfigurationInput, type MeasurementUnit, type TelemetrySignal } from '@/shared/api';
import { COMPONENT_KIND, COMPONENT_KINDS, enumLabel, enumOptions, fieldLabel, HINT, KINDS_FOR_VALUE_TYPE, MACHINE_STATE, SEMANTIC, SIGNAL_KIND, SIGNAL_SEMANTICS, USER_STATES, VALUE_TYPE, type SignalSemantic } from '@/shared/i18n';
import { makeCode } from '@/shared/lib';
import { CodeField, DurationInput, EnumSelect, HintLabel, Panel, useAutoCode } from '@/shared/ui';
import { confirmDisable, errorMessage, FormModal, setupKey, StatusBadge, StatusToggle, useRefreshConfig, useStatusMutation } from './common';
import { unitOptions, unitSymbol } from './units';
import { suggestRules } from './suggestRules';

type ComponentT = Awaited<ReturnType<typeof setup.allComponents>>[number];

export function MachineDrawer({ machineId, initialTab = 'passport', readOnly, onClose }: { machineId: string | null; initialTab?: 'passport' | 'components' | 'signals' | 'states'; readOnly: boolean; onClose: () => void }) {
  const machine = useQuery({ queryKey: setupKey('machine', machineId ?? ''), queryFn: () => setup.machine(machineId!), enabled: !!machineId });
  return (
    <Drawer opened={!!machineId} onClose={onClose} position="right" size="xl" title={machine.data ? `${machine.data.name} · ${machine.data.code}` : 'Машина'}>
      {machineId && (
        <Tabs key={`${machineId}:${initialTab}`} defaultValue={initialTab} keepMounted={false}>
          <Tabs.List mb="sm">
            <Tabs.Tab value="passport">Паспорт</Tabs.Tab>
            <Tabs.Tab value="components">Узлы</Tabs.Tab>
            <Tabs.Tab value="signals">Сигналы</Tabs.Tab>
            <Tabs.Tab value="states">Правила состояний</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="passport"><Passport machineId={machineId} readOnly={readOnly} /></Tabs.Panel>
          <Tabs.Panel value="components"><Components machineId={machineId} readOnly={readOnly} /></Tabs.Panel>
          <Tabs.Panel value="signals"><Signals machineId={machineId} readOnly={readOnly} /></Tabs.Panel>
          <Tabs.Panel value="states"><States machineId={machineId} readOnly={readOnly} /></Tabs.Panel>
        </Tabs>
      )}
    </Drawer>
  );
}

function Passport({ machineId, readOnly }: { machineId: string; readOnly: boolean }) {
  const refresh = useRefreshConfig();
  const machine = useQuery({ queryKey: setupKey('machine', machineId), queryFn: () => setup.machine(machineId) });
  const readiness = useQuery({ queryKey: setupKey('readiness', machineId), queryFn: () => setup.readiness(machineId) });
  const units = useQuery({ queryKey: setupKey('measurement-units'), queryFn: setup.measurementUnits, staleTime: Infinity });
  const lines = useQuery({ queryKey: setupKey('lines-all', machine.data?.enterpriseId ?? ''), queryFn: () => setup.allLines(machine.data!.enterpriseId), enabled: !!machine.data });
  const [lineId, setLineId] = useState('');
  const status = useStatusMutation<{ id: string }>(setup.setMachineStatus, 'Машина');
  const assign = useMutation({
    mutationFn: () => setup.assign(lineId, [machineId]),
    onSuccess: async () => { await refresh(); notifications.show({ color: 'green', message: 'Машина назначена на линию' }); },
    onError: (e) => notifications.show({ color: 'red', message: errorMessage(e) }),
  });
  const m = machine.data;
  if (!m) return <Text c="dimmed">Загрузка…</Text>;
  const r = readiness.data;
  const line = lines.data?.find((l) => l.id === m.lineId);
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <StatusBadge machine status={m.status} />
        {!readOnly && <StatusToggle status={m.status} loading={status.isPending} onToggle={(next: ConfigStatus) => confirmDisable(m.name, next) && status.mutate({ item: m, status: next })} />}
      </Group>
      <Table withRowBorders={false} verticalSpacing={3}>
        <Table.Tbody>
          {([['Линия', line?.name ?? 'не назначена'], ['Тип', m.machineType], ['Инв. номер', m.inventoryNo], ['Производитель', m.manufacturer], ['Модель', m.model], ['Год ввода', m.commissioningYear], ['Норма выпуска', m.nominalRate ? `${m.nominalRate} ${unitSymbol(units.data ?? [], m.productionUnit)}/ч` : null]] as const).map(([k, v]) => (
            <Table.Tr key={k}><Table.Td c="dimmed" w="35%">{k}</Table.Td><Table.Td>{v ?? '—'}</Table.Td></Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {m.parameters.length > 0 && (
        <List size="sm" spacing={2}>
          {(m.parameters as unknown as Array<{ code: string; name: string; value: unknown; unitCode?: string | null }>).map((p) => <List.Item key={p.code}>{p.name}: <b>{String(p.value)}</b> {p.unitCode ?? ''}</List.Item>)}
        </List>
      )}
      {!m.lineId && !readOnly && (
        <Group align="flex-end">
          <NativeSelect label="Назначить на линию" style={{ flex: 1 }} value={lineId} data={[{ value: '', label: 'Выберите линию' }, ...(lines.data ?? []).filter((l) => l.status === 'ACTIVE').map((l) => ({ value: l.id, label: l.name }))]} onChange={(e) => setLineId(e.currentTarget.value)} />
          <Button disabled={!lineId} loading={assign.isPending} onClick={() => assign.mutate()}>Назначить</Button>
        </Group>
      )}
      {r && (
        <Alert color={r.ready ? 'green' : 'orange'} title={r.ready ? 'Готова к активации' : 'Не готова к активации'}>
          <Stack gap={2}>
            {r.errors.map((e, i) => <Text key={i} size="sm" c="red">{e.message}</Text>)}
            {r.warnings.map((e, i) => <Text key={i} size="sm" c="yellow.8">{e.message}</Text>)}
            {r.ready && !r.warnings.length && <Text size="sm">Замечаний нет</Text>}
          </Stack>
        </Alert>
      )}
    </Stack>
  );
}

function Components({ machineId, readOnly }: { machineId: string; readOnly: boolean }) {
  const q = useQuery({ queryKey: setupKey('components-all', machineId), queryFn: () => setup.allComponents(machineId) });
  const [edit, setEdit] = useState<ComponentT | 'new' | null>(null);
  const status = useStatusMutation<ComponentT>(setup.setComponentStatus, 'Компонент');
  const all = q.data ?? [];
  const depth = (c: ComponentT) => { let d = 0; for (let p = c.parentComponentId; p; p = all.find((x) => x.id === p)?.parentComponentId ?? null) d++; return d; };
  const ordered = (() => {
    const out: ComponentT[] = [];
    const walk = (parent: string | null) => all.filter((c) => (c.parentComponentId ?? null) === parent).sort((a, b) => a.sortOrder - b.sortOrder).forEach((c) => { out.push(c); walk(c.id); });
    walk(null);
    return out.length === all.length ? out : all;
  })();
  return (
    <Stack gap="xs">
      <Group justify="flex-end">{!readOnly && <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setEdit('new')}>Новый узел</Button>}</Group>
      <Panel title={<HintLabel hint={HINT.component}>Узлы машины <Badge variant="light" ml={6}>{all.length}</Badge></HintLabel>} state={{ isLoading: q.isLoading, isError: q.isError, error: q.error, isEmpty: !q.isLoading && !all.length, refetch: () => void q.refetch() }}>
        <Table verticalSpacing={5}>
          <Table.Tbody>
            {ordered.map((c) => (
              <Table.Tr key={c.id}>
                <Table.Td><Text size="sm" pl={depth(c) * 16}>{c.name}</Text><Text size="xs" c="dimmed" ff="monospace" pl={depth(c) * 16}>{enumLabel(COMPONENT_KIND, c.kind)} · {c.code}</Text></Table.Td>
                <Table.Td><StatusBadge status={c.status} /></Table.Td>
                <Table.Td>
                  {!readOnly && <Group gap={2} justify="flex-end" wrap="nowrap">
                    <ActionIcon variant="subtle" aria-label="Редактировать узел" onClick={() => setEdit(c)}><IconPencil size={16} /></ActionIcon>
                    <StatusToggle status={c.status} onToggle={(next) => confirmDisable(c.name, next) && status.mutate({ item: c, status: next })} />
                  </Group>}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Panel>
      {edit && <ComponentForm key={edit === 'new' ? 'new' : edit.id} machineId={machineId} all={all} item={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </Stack>
  );
}

const KIND_OPTIONS = COMPONENT_KINDS.map((k) => ({ value: k, label: COMPONENT_KIND[k].label, hint: COMPONENT_KIND[k].hint, group: COMPONENT_KIND[k].group }));

function ComponentForm({ machineId, all, item, onClose }: { machineId: string; all: ComponentT[]; item: ComponentT | null; onClose: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const code = useAutoCode(name, 'CMP', all.map((c) => c.code), item?.code);
  const [kind, setKind] = useState<string>(item?.kind ?? 'OTHER');
  const [parent, setParent] = useState(item?.parentComponentId ?? '');
  const [order, setOrder] = useState<number | ''>(item?.sortOrder ?? all.length * 10);
  const blocked = new Set<string>();
  if (item) { const walk = (id: string) => { blocked.add(id); all.filter((c) => c.parentComponentId === id).forEach((c) => walk(c.id)); }; walk(item.id); }
  return (
    <FormModal opened onClose={onClose} title={item ? 'Узел машины' : 'Новый узел машины'} success={item ? 'Узел сохранён' : 'Узел создан'} canSubmit={!!name.trim() && code.valid}
      submit={async () => {
        const common = { name: name.trim(), kind: kind as Component['kind'], sortOrder: Number(order || 0), parameters: item?.parameters ?? [] };
        if (!item) return setup.createComponent(machineId, { code: code.value, parentComponentId: parent || null, ...common });
        const saved = await setup.updateComponent(item.id, common);
        if ((item.parentComponentId ?? '') !== parent) await setup.moveComponent(item.id, parent || null);
        return saved;
      }}>
      {(fe) => (
        <>
          <Text size="sm" c="dimmed">{HINT.component}</Text>
          <TextInput label="Название" placeholder="Шнек" required data-autofocus value={name} error={fe('name')} onChange={(e) => setName(e.currentTarget.value)} />
          <SimpleGrid cols={{ base: 1, xs: 2 }}>
            <EnumSelect label="Вид узла" hint={HINT.componentKind} options={KIND_OPTIONS} value={kind} error={fe('kind')} onChange={setKind} />
            <NumberInput label="Порядок" min={0} value={order} onChange={(v) => setOrder(v === '' ? '' : Number(v))} />
          </SimpleGrid>
          <NativeSelect label="Входит в узел" description="Узлы могут быть вложенными: «Привод» → «Двигатель»" value={parent} error={fe('parentComponentId')} data={[{ value: '', label: 'Верхний уровень машины' }, ...all.filter((c) => !blocked.has(c.id)).map((c) => ({ value: c.id, label: c.name }))]} onChange={(e) => setParent(e.currentTarget.value)} />
          <CodeField code={code} locked={!!item} error={fe('code')} />
        </>
      )}
    </FormModal>
  );
}

function Signals({ machineId, readOnly }: { machineId: string; readOnly: boolean }) {
  const q = useQuery({ queryKey: setupKey('signals-all', machineId), queryFn: () => setup.allSignals(machineId) });
  const components = useQuery({ queryKey: setupKey('components-all', machineId), queryFn: () => setup.allComponents(machineId) });
  const units = useQuery({ queryKey: setupKey('measurement-units'), queryFn: setup.measurementUnits, staleTime: Infinity });
  const [edit, setEdit] = useState<TelemetrySignal | 'new' | null>(null);
  const status = useStatusMutation<TelemetrySignal>(setup.setSignalStatus, 'Сигнал');
  const items = q.data ?? [];
  return (
    <Stack gap="xs">
      <Group justify="flex-end">{!readOnly && <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setEdit('new')}>Новый сигнал</Button>}</Group>
      <Panel title={<>Сигналы <Badge variant="light" ml={6}>{items.length}</Badge></>} state={{ isLoading: q.isLoading, isError: q.isError, error: q.error, isEmpty: !q.isLoading && !items.length, refetch: () => void q.refetch() }}>
        <Table.ScrollContainer minWidth={520}>
          <Table verticalSpacing={5}>
            <Table.Thead><Table.Tr><Table.Th>Сигнал</Table.Th><Table.Th>Характер и формат</Table.Th><Table.Th>Ед.</Table.Th><Table.Th>Статус</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {items.map((s) => (
                <Table.Tr key={s.id}>
                  <Table.Td><Text size="sm" component="div">{s.name}{s.featured && <Tooltip label={HINT.featured}><Badge size="xs" ml={6}>★ на карточке</Badge></Tooltip>}</Text><Text size="xs" c="dimmed">{s.semanticCode === 'CUSTOM' ? `Другое: ${s.customSemanticCode ?? ''}` : enumLabel(SEMANTIC, s.semanticCode)} · <Text span ff="monospace" inherit>{s.code}</Text></Text></Table.Td>
                  <Table.Td><Text size="sm">{enumLabel(SIGNAL_KIND, s.signalKind)}</Text><Text size="xs" c="dimmed">{enumLabel(VALUE_TYPE, s.valueType)}</Text></Table.Td>
                  <Table.Td>{unitSymbol(units.data ?? [], s.unitCode) || '—'}</Table.Td>
                  <Table.Td><StatusBadge status={s.status} /></Table.Td>
                  <Table.Td>
                    {!readOnly && <Group gap={2} justify="flex-end" wrap="nowrap">
                      <ActionIcon variant="subtle" aria-label="Редактировать сигнал" onClick={() => setEdit(s)}><IconPencil size={16} /></ActionIcon>
                      <StatusToggle status={s.status} onToggle={(next) => confirmDisable(s.name, next) && status.mutate({ item: s, status: next })} />
                    </Group>}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Panel>
      {edit && <SignalForm key={edit === 'new' ? 'new' : edit.id} machineId={machineId} components={(components.data ?? []).filter((c) => c.status === 'ACTIVE')} units={units.data ?? []} taken={items.map((s) => s.code)} item={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </Stack>
  );
}

const SEMANTIC_OPTIONS = SIGNAL_SEMANTICS.map((c) => ({ value: c, label: SEMANTIC[c].label, hint: [SEMANTIC[c].hint, SEMANTIC[c].unit].filter(Boolean).join(' · ') }));
const VALUE_TYPE_OPTIONS = enumOptions(VALUE_TYPE);

function SignalForm({ machineId, components, units, taken, item, onClose }: { machineId: string; components: ComponentT[]; units: MeasurementUnit[]; taken: string[]; item: TelemetrySignal | null; onClose: () => void }) {
  const [v, setV] = useState({
    name: item?.name ?? '', description: item?.description ?? '',
    valueType: item?.valueType ?? 'DOUBLE', signalKind: item?.signalKind ?? 'GAUGE', semanticCode: item?.semanticCode ?? 'TEMPERATURE',
    customSemanticCode: item?.customSemanticCode ?? '', unitCode: item?.unitCode ?? '', componentId: item?.componentId ?? '',
    expectedIntervalMs: item?.expectedIntervalMs ?? ('' as number | ''), staleAfterMs: item?.staleAfterMs ?? (item ? ('' as number | '') : 60_000),
    validMin: item?.validMin ?? ('' as number | ''), validMax: item?.validMax ?? ('' as number | ''),
    featured: item?.featured ?? false, displayOrder: item?.displayOrder ?? ('' as number | ''),
  });
  const patch = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  const code = useAutoCode(v.name, 'SIG', taken, item?.code);
  const numeric = v.valueType === 'DOUBLE' || v.valueType === 'LONG';
  const kinds = KINDS_FOR_VALUE_TYPE[v.valueType];
  const n = (x: number | '') => (x === '' ? null : Number(x));
  const semantics = SIGNAL_SEMANTICS.includes(v.semanticCode as SignalSemantic) ? SEMANTIC_OPTIONS : [...SEMANTIC_OPTIONS, { value: v.semanticCode, label: v.semanticCode, hint: '' }];
  const customCode = v.customSemanticCode || makeCode(v.name, 'CUSTOM');
  /** Новому сигналу выбор «что измеряет» подставляет рекомендуемые формат и характер. */
  const pickSemantic = (semanticCode: string) => {
    const t = SEMANTIC[semanticCode as SignalSemantic];
    if (item || !t?.valueType || !t.signalKind) return patch({ semanticCode });
    const isNumeric = t.valueType === 'DOUBLE' || t.valueType === 'LONG';
    patch({ semanticCode, valueType: t.valueType, signalKind: t.signalKind, ...(isNumeric ? {} : { unitCode: '', validMin: '', validMax: '' }) });
  };
  const pickValueType = (valueType: typeof v.valueType) => {
    const allowed = KINDS_FOR_VALUE_TYPE[valueType];
    const isNumeric = valueType === 'DOUBLE' || valueType === 'LONG';
    patch({ valueType, signalKind: allowed.includes(v.signalKind) ? v.signalKind : allowed[0], ...(isNumeric ? {} : { unitCode: '', validMin: '', validMax: '' }) });
  };
  return (
    <FormModal opened onClose={onClose} size="lg" title={item ? 'Сигнал' : 'Новый сигнал'} success={item ? 'Сигнал сохранён' : 'Сигнал создан'} canSubmit={!!v.name.trim() && !!v.semanticCode && code.valid}
      submit={() => {
        const common = {
          componentId: v.componentId || null, name: v.name.trim(), description: v.description.trim() || null,
          valueType: v.valueType, signalKind: kinds.includes(v.signalKind) ? v.signalKind : kinds[0], semanticCode: v.semanticCode,
          customSemanticCode: v.semanticCode === 'CUSTOM' ? customCode : null,
          unitCode: numeric ? v.unitCode.trim() || null : null,
          expectedIntervalMs: n(v.expectedIntervalMs), staleAfterMs: n(v.staleAfterMs),
          validMin: numeric ? n(v.validMin) : null, validMax: numeric ? n(v.validMax) : null,
          featured: v.featured, displayOrder: n(v.displayOrder),
        };
        return item ? setup.updateSignal(item.id, common) : setup.createSignal(machineId, { code: code.value, ...common });
      }}>
      {(fe) => (
        <>
          <Text size="sm" c="dimmed">Сигнал — значение, которое машина передаёт: температура, скорость, «в работе да/нет», счётчик изделий.</Text>
          <SimpleGrid cols={{ base: 1, xs: 2 }}>
            <TextInput label="Название" placeholder="Температура зоны 1" required data-autofocus value={v.name} error={fe('name')} onChange={(e) => patch({ name: e.currentTarget.value })} />
            <NativeSelect label={<HintLabel hint={HINT.component}>Где установлен</HintLabel>} value={v.componentId} data={[{ value: '', label: 'Вся машина' }, ...components.map((c) => ({ value: c.id, label: c.name }))]} onChange={(e) => patch({ componentId: e.currentTarget.value })} />
            <EnumSelect label="Что измеряет" hint={HINT.semantic} options={semantics} value={v.semanticCode} error={fe('semanticCode')} onChange={pickSemantic} />
            {v.semanticCode === 'CUSTOM' ? (
              <TextInput label="Своя величина (код)" description="Создаётся из названия сигнала" ff="monospace" value={customCode} error={fe('customSemanticCode')} onChange={(e) => patch({ customSemanticCode: e.currentTarget.value.toUpperCase() })} />
            ) : <div />}
            <EnumSelect label="Формат значения" hint={HINT.valueType} options={VALUE_TYPE_OPTIONS} value={v.valueType} error={fe('valueType')} onChange={(x) => pickValueType(x as typeof v.valueType)} />
            <EnumSelect label="Характер сигнала" hint={HINT.signalKind} disabled={kinds.length < 2} options={enumOptions(SIGNAL_KIND, kinds)} value={kinds.includes(v.signalKind) ? v.signalKind : kinds[0]} error={fe('signalKind')} onChange={(x) => patch({ signalKind: x as typeof v.signalKind })} />
            {numeric && <NativeSelect label={<HintLabel hint={HINT.unit}>Единица измерения</HintLabel>} value={v.unitCode} error={fe('unitCode')} data={unitOptions(units, v.unitCode, 'Без единицы')} onChange={(e) => patch({ unitCode: e.currentTarget.value })} />}
            {numeric && <div />}
            <DurationInput label="Значение приходит раз в" hint={HINT.expectedInterval} min={1} value={v.expectedIntervalMs} error={fe('expectedIntervalMs')} onChange={(x) => patch({ expectedIntervalMs: x })} />
            <DurationInput label="Считать устаревшим через" hint={HINT.staleAfter} min={1} value={v.staleAfterMs} error={fe('staleAfterMs')} onChange={(x) => patch({ staleAfterMs: x })} />
            {numeric && <NumberInput label={<HintLabel hint={HINT.validRange}>Допустимый минимум</HintLabel>} value={v.validMin} error={fe('validMin')} onChange={(x) => patch({ validMin: x === '' ? '' : Number(x) })} />}
            {numeric && <NumberInput label={<HintLabel hint={HINT.validRange}>Допустимый максимум</HintLabel>} value={v.validMax} error={fe('validMax')} onChange={(x) => patch({ validMax: x === '' ? '' : Number(x) })} />}
            <NumberInput label="Порядок отображения" min={0} value={v.displayOrder} onChange={(x) => patch({ displayOrder: x === '' ? '' : Number(x) })} />
          </SimpleGrid>
          <TextInput label="Описание" value={v.description} onChange={(e) => patch({ description: e.currentTarget.value })} />
          <Checkbox label="★ Показывать на карточке машины в мониторинге" checked={v.featured} onChange={(e) => patch({ featured: e.currentTarget.checked })} />
          <CodeField code={code} locked={!!item} error={fe('code')} />
        </>
      )}
    </FormModal>
  );
}

const issueText = (e: unknown) =>
  e instanceof ApiError && e.fieldErrors.length
    ? [errorMessage(e), ...e.fieldErrors.map((f) => `${fieldLabel(f.path)}: ${f.message}`)]
    : [errorMessage(e)];
const PLACEHOLDER = /<[^">]*(uuid|id)[^">]*>|signalId"\s*:\s*"(?![0-9a-fA-F]{8}-)/i;

function States({ machineId, readOnly }: { machineId: string; readOnly: boolean }) {
  const refresh = useRefreshConfig();
  const q = useQuery({ queryKey: setupKey('state-config', machineId), queryFn: () => setup.stateConfig(machineId) });
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [defaultState, setDefaultState] = useState('IDLE');
  const [offline, setOffline] = useState<number | ''>(60_000);
  const [rules, setRules] = useState('[]');
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; messages: string[] } | null>(null);
  const key = q.isSuccess ? `${machineId}:${q.dataUpdatedAt}` : null;
  if (key && key !== loadedFor) {
    setLoadedFor(key);
    if (q.data) { setDefaultState(q.data.defaultState); setOffline(q.data.offlineAfterMs); setRules(JSON.stringify(q.data.rules, null, 2)); }
  }
  const body = (): MachineStateConfigurationInput | null => {
    try {
      setParseError(null);
      if (PLACEHOLDER.test(rules)) throw new Error('В правилах остались заглушки вместо signalId. Нажмите «Сгенерировать по сигналам» или подставьте идентификаторы сигналов этой машины (вкладка «Сигналы»)');
      return { defaultState: defaultState as MachineStateConfigurationInput['defaultState'], offlineAfterMs: Number(offline || 0), rules: JSON.parse(rules) };
    } catch (e) {
      setParseError((e as Error).message.startsWith('В правилах') ? (e as Error).message : `Некорректный JSON: ${(e as Error).message}`);
      return null;
    }
  };
  const generate = useMutation({
    mutationFn: () => setup.allSignals(machineId),
    onSuccess: (signals) => {
      if (rules.trim() !== '[]' && rules.trim() !== '' && !window.confirm('Заменить текущие правила сгенерированным черновиком?')) return;
      const { config, notes } = suggestRules(signals);
      setDefaultState(config.defaultState);
      setOffline(config.offlineAfterMs);
      setRules(JSON.stringify(config.rules, null, 2));
      setParseError(null);
      setResult({ ok: config.rules.length > 0, messages: [config.rules.length ? `Сгенерировано правил: ${config.rules.length}. Проверьте пороги и нажмите «Проверить».` : 'Правила не созданы', ...notes] });
    },
    onError: (e) => setResult({ ok: false, messages: issueText(e) }),
  });
  const validate = useMutation({
    mutationFn: async () => { const b = body(); return b ? setup.validateState(machineId, b) : null; },
    onSuccess: (r) => r && setResult({ ok: r.valid, messages: [...r.errors.map((e) => `Ошибка: ${e.message}${e.path ? ` (${e.path})` : ''}`), ...r.warnings.map((e) => `Предупреждение: ${e.message}`)] }),
    onError: (e) => setResult({ ok: false, messages: issueText(e) }),
  });
  const save = useMutation({
    mutationFn: async () => { const b = body(); return b ? setup.saveState(machineId, b) : null; },
    onSuccess: async (r) => { if (r) { await refresh(); setResult({ ok: true, messages: ['Правила сохранены'] }); } },
    onError: (e) => setResult({ ok: false, messages: issueText(e) }),
  });
  return (
    <Stack gap="sm">
      {!q.isLoading && !q.data && <Alert color="gray" p="xs">Правила ещё не заданы. Без них машину нельзя активировать.</Alert>}
      <SimpleGrid cols={2}>
        <EnumSelect label="Состояние по умолчанию" hint={HINT.defaultState} disabled={readOnly} options={enumOptions(MACHINE_STATE, USER_STATES)} value={defaultState} onChange={setDefaultState} />
        <DurationInput label="«Нет данных» через" hint={HINT.offlineAfter} disabled={readOnly} min={1} value={offline} onChange={setOffline} />
      </SimpleGrid>
      <Textarea label="Правила (JSON)" description="Пока правила задаются в JSON. Нажмите «Сгенерировать по сигналам», чтобы получить черновик, затем «Проверить». Состояния: RUN — Работа, IDLE — Простой, DOWN — Авария, SETUP — Переналадка, PLANNED_STOP — Плановая остановка" disabled={readOnly} autosize minRows={10} maxRows={24} styles={{ input: { fontFamily: 'ui-monospace, monospace' } }} value={rules} onChange={(e) => setRules(e.currentTarget.value)} error={parseError} />
      {result && (
        <Alert color={result.ok ? 'green' : 'red'} p="xs">
          {result.messages.length ? result.messages.map((m, i) => <Text key={i} size="sm">{m}</Text>) : <Text size="sm">Проверка пройдена</Text>}
        </Alert>
      )}
      {!readOnly && (
        <Group justify="flex-end">
          <Button variant="subtle" loading={generate.isPending} onClick={() => generate.mutate()}>Сгенерировать по сигналам</Button>
          <Button variant="light" loading={validate.isPending} onClick={() => validate.mutate()}>Проверить</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>Сохранить</Button>
        </Group>
      )}
    </Stack>
  );
}
