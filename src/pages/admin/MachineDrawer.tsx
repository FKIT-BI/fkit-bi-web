import { ActionIcon, Alert, Badge, Button, Checkbox, Drawer, Group, List, NativeSelect, NumberInput, SimpleGrid, Stack, Table, Tabs, Text, Textarea, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, setup, type Component, type ConfigStatus, type MachineStateConfigurationInput, type TelemetrySignal } from '@/shared/api';
import { Panel } from '@/shared/ui';
import { confirmDisable, errorMessage, FormModal, setupKey, StatusBadge, StatusToggle, useRefreshConfig, useStatusMutation } from './common';
import { COMPONENT_KINDS, SIGNAL_SEMANTICS } from './EquipmentSetup';
import { suggestRules } from './suggestRules';

const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
type ComponentT = Awaited<ReturnType<typeof setup.allComponents>>[number];

export function MachineDrawer({ machineId, initialTab = 'passport', readOnly, onClose }: { machineId: string | null; initialTab?: 'passport' | 'components' | 'signals' | 'states'; readOnly: boolean; onClose: () => void }) {
  const machine = useQuery({ queryKey: setupKey('machine', machineId ?? ''), queryFn: () => setup.machine(machineId!), enabled: !!machineId });
  return (
    <Drawer opened={!!machineId} onClose={onClose} position="right" size="xl" title={machine.data ? `${machine.data.name} · ${machine.data.code}` : 'Машина'}>
      {machineId && (
        <Tabs key={`${machineId}:${initialTab}`} defaultValue={initialTab} keepMounted={false}>
          <Tabs.List mb="sm">
            <Tabs.Tab value="passport">Паспорт</Tabs.Tab>
            <Tabs.Tab value="components">Компоненты</Tabs.Tab>
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
        <StatusBadge status={m.status} />
        {!readOnly && <StatusToggle status={m.status} loading={status.isPending} onToggle={(next: ConfigStatus) => confirmDisable(m.name, next) && status.mutate({ item: m, status: next })} />}
      </Group>
      <Table withRowBorders={false} verticalSpacing={3}>
        <Table.Tbody>
          {([['Линия', line?.name ?? 'не назначена'], ['Тип', m.machineType], ['Инв. номер', m.inventoryNo], ['Производитель', m.manufacturer], ['Модель', m.model], ['Год ввода', m.commissioningYear], ['Норма выпуска', m.nominalRate ? `${m.nominalRate} ${m.productionUnit ?? ''}/ч` : null]] as const).map(([k, v]) => (
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
      <Group justify="flex-end">{!readOnly && <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setEdit('new')}>Новый компонент</Button>}</Group>
      <Panel title={<>Компоненты <Badge variant="light" ml={6}>{all.length}</Badge></>} state={{ isLoading: q.isLoading, isError: q.isError, error: q.error, isEmpty: !q.isLoading && !all.length, refetch: () => void q.refetch() }}>
        <Table verticalSpacing={5}>
          <Table.Tbody>
            {ordered.map((c) => (
              <Table.Tr key={c.id}>
                <Table.Td><Text size="sm" pl={depth(c) * 16}>{c.name}</Text><Text size="xs" c="dimmed" ff="monospace" pl={depth(c) * 16}>{c.code} · {c.kind}</Text></Table.Td>
                <Table.Td><StatusBadge status={c.status} /></Table.Td>
                <Table.Td>
                  {!readOnly && <Group gap={2} justify="flex-end" wrap="nowrap">
                    <ActionIcon variant="subtle" aria-label="Редактировать компонент" onClick={() => setEdit(c)}><IconPencil size={16} /></ActionIcon>
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

function ComponentForm({ machineId, all, item, onClose }: { machineId: string; all: ComponentT[]; item: ComponentT | null; onClose: () => void }) {
  const [code, setCode] = useState(item?.code ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [kind, setKind] = useState<string>(item?.kind ?? 'OTHER');
  const [parent, setParent] = useState(item?.parentComponentId ?? '');
  const [order, setOrder] = useState<number | ''>(item?.sortOrder ?? all.length * 10);
  const blocked = new Set<string>();
  if (item) { const walk = (id: string) => { blocked.add(id); all.filter((c) => c.parentComponentId === id).forEach((c) => walk(c.id)); }; walk(item.id); }
  return (
    <FormModal opened onClose={onClose} title={item ? 'Компонент' : 'Новый компонент'} success={item ? 'Компонент сохранён' : 'Компонент создан'} canSubmit={!!name.trim() && (!!item || CODE.test(code))}
      submit={async () => {
        const common = { name: name.trim(), kind: kind as Component['kind'], sortOrder: Number(order || 0), parameters: item?.parameters ?? [] };
        if (!item) return setup.createComponent(machineId, { code, parentComponentId: parent || null, ...common });
        const saved = await setup.updateComponent(item.id, common);
        if ((item.parentComponentId ?? '') !== parent) await setup.moveComponent(item.id, parent || null);
        return saved;
      }}>
      {(fe) => (
        <>
          <TextInput label="Код" description="A–Z, цифры, _" disabled={!!item} required value={code} error={fe('code')} onChange={(e) => setCode(e.currentTarget.value.toUpperCase())} />
          <TextInput label="Название" required value={name} error={fe('name')} onChange={(e) => setName(e.currentTarget.value)} />
          <SimpleGrid cols={2}>
            <NativeSelect label="Вид" value={kind} data={COMPONENT_KINDS} error={fe('kind')} onChange={(e) => setKind(e.currentTarget.value)} />
            <NumberInput label="Порядок" min={0} value={order} onChange={(v) => setOrder(v === '' ? '' : Number(v))} />
          </SimpleGrid>
          <NativeSelect label="Родительский компонент" value={parent} error={fe('parentComponentId')} data={[{ value: '', label: 'Корень' }, ...all.filter((c) => !blocked.has(c.id)).map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))]} onChange={(e) => setParent(e.currentTarget.value)} />
        </>
      )}
    </FormModal>
  );
}

function Signals({ machineId, readOnly }: { machineId: string; readOnly: boolean }) {
  const q = useQuery({ queryKey: setupKey('signals-all', machineId), queryFn: () => setup.allSignals(machineId) });
  const components = useQuery({ queryKey: setupKey('components-all', machineId), queryFn: () => setup.allComponents(machineId) });
  const [edit, setEdit] = useState<TelemetrySignal | 'new' | null>(null);
  const status = useStatusMutation<TelemetrySignal>(setup.setSignalStatus, 'Сигнал');
  const items = q.data ?? [];
  return (
    <Stack gap="xs">
      <Group justify="flex-end">{!readOnly && <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setEdit('new')}>Новый сигнал</Button>}</Group>
      <Panel title={<>Сигналы <Badge variant="light" ml={6}>{items.length}</Badge></>} state={{ isLoading: q.isLoading, isError: q.isError, error: q.error, isEmpty: !q.isLoading && !items.length, refetch: () => void q.refetch() }}>
        <Table.ScrollContainer minWidth={520}>
          <Table verticalSpacing={5}>
            <Table.Thead><Table.Tr><Table.Th>Сигнал</Table.Th><Table.Th>Тип</Table.Th><Table.Th>Ед.</Table.Th><Table.Th>Статус</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {items.map((s) => (
                <Table.Tr key={s.id}>
                  <Table.Td><Text size="sm">{s.name}{s.featured && <Badge size="xs" ml={6}>главный</Badge>}</Text><Text size="xs" c="dimmed" ff="monospace">{s.code} · {s.semanticCode}</Text></Table.Td>
                  <Table.Td>{s.signalKind} / {s.valueType}</Table.Td>
                  <Table.Td>{s.unitCode ?? '—'}</Table.Td>
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
      {edit && <SignalForm key={edit === 'new' ? 'new' : edit.id} machineId={machineId} components={(components.data ?? []).filter((c) => c.status === 'ACTIVE')} item={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </Stack>
  );
}

function SignalForm({ machineId, components, item, onClose }: { machineId: string; components: ComponentT[]; item: TelemetrySignal | null; onClose: () => void }) {
  const [v, setV] = useState({
    code: item?.code ?? '', name: item?.name ?? '', description: item?.description ?? '',
    valueType: item?.valueType ?? 'DOUBLE', signalKind: item?.signalKind ?? 'GAUGE', semanticCode: item?.semanticCode ?? 'TEMPERATURE',
    customSemanticCode: item?.customSemanticCode ?? '', unitCode: item?.unitCode ?? '', componentId: item?.componentId ?? '',
    expectedIntervalMs: item?.expectedIntervalMs ?? ('' as number | ''), staleAfterMs: item?.staleAfterMs ?? ('' as number | ''),
    validMin: item?.validMin ?? ('' as number | ''), validMax: item?.validMax ?? ('' as number | ''),
    featured: item?.featured ?? false, displayOrder: item?.displayOrder ?? ('' as number | ''),
  });
  const patch = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  const numeric = v.valueType === 'DOUBLE' || v.valueType === 'LONG';
  const n = (x: number | '') => (x === '' ? null : Number(x));
  const semantics = SIGNAL_SEMANTICS.includes(v.semanticCode) ? SIGNAL_SEMANTICS : [...SIGNAL_SEMANTICS, v.semanticCode];
  return (
    <FormModal opened onClose={onClose} size="lg" title={item ? 'Сигнал' : 'Новый сигнал'} success={item ? 'Сигнал сохранён' : 'Сигнал создан'} canSubmit={!!v.name.trim() && !!v.semanticCode && (!!item || CODE.test(v.code))}
      submit={() => {
        const common = {
          componentId: v.componentId || null, name: v.name.trim(), description: v.description.trim() || null,
          valueType: v.valueType, signalKind: numeric ? v.signalKind : ('STATE' as const), semanticCode: v.semanticCode,
          customSemanticCode: v.semanticCode === 'CUSTOM' ? v.customSemanticCode || null : null,
          unitCode: numeric ? v.unitCode.trim() || null : null,
          expectedIntervalMs: n(v.expectedIntervalMs), staleAfterMs: n(v.staleAfterMs),
          validMin: numeric ? n(v.validMin) : null, validMax: numeric ? n(v.validMax) : null,
          featured: v.featured, displayOrder: n(v.displayOrder),
        };
        return item ? setup.updateSignal(item.id, common) : setup.createSignal(machineId, { code: v.code, ...common });
      }}>
      {(fe) => (
        <>
          <SimpleGrid cols={{ base: 1, xs: 2 }}>
            <TextInput label="Код" description="A–Z, цифры, _" disabled={!!item} required value={v.code} error={fe('code')} onChange={(e) => patch({ code: e.currentTarget.value.toUpperCase() })} />
            <TextInput label="Название" required value={v.name} error={fe('name')} onChange={(e) => patch({ name: e.currentTarget.value })} />
            <NativeSelect label="Тип значения" value={v.valueType} data={['DOUBLE', 'LONG', 'BOOLEAN', 'STRING']} error={fe('valueType')} onChange={(e) => patch({ valueType: e.currentTarget.value as typeof v.valueType })} />
            <NativeSelect label="Вид сигнала" disabled={!numeric} value={numeric ? v.signalKind : 'STATE'} data={['GAUGE', 'COUNTER', 'STATE']} error={fe('signalKind')} onChange={(e) => patch({ signalKind: e.currentTarget.value as typeof v.signalKind })} />
            <NativeSelect label="Семантика" value={v.semanticCode} data={semantics} error={fe('semanticCode')} onChange={(e) => patch({ semanticCode: e.currentTarget.value })} />
            {v.semanticCode === 'CUSTOM' && <TextInput label="Своя семантика" value={v.customSemanticCode} onChange={(e) => patch({ customSemanticCode: e.currentTarget.value })} />}
            <NativeSelect label="Компонент" value={v.componentId} data={[{ value: '', label: 'Без компонента' }, ...components.map((c) => ({ value: c.id, label: c.name }))]} onChange={(e) => patch({ componentId: e.currentTarget.value })} />
            {numeric && <TextInput label="Единица" value={v.unitCode} error={fe('unitCode')} onChange={(e) => patch({ unitCode: e.currentTarget.value })} />}
            <NumberInput label="Ожидаемый период, мс" min={1} value={v.expectedIntervalMs} onChange={(x) => patch({ expectedIntervalMs: x === '' ? '' : Number(x) })} />
            <NumberInput label="Устаревает через, мс" min={1} value={v.staleAfterMs} onChange={(x) => patch({ staleAfterMs: x === '' ? '' : Number(x) })} />
            {numeric && <NumberInput label="Допустимый минимум" value={v.validMin} onChange={(x) => patch({ validMin: x === '' ? '' : Number(x) })} />}
            {numeric && <NumberInput label="Допустимый максимум" value={v.validMax} onChange={(x) => patch({ validMax: x === '' ? '' : Number(x) })} />}
            <NumberInput label="Порядок отображения" min={0} value={v.displayOrder} onChange={(x) => patch({ displayOrder: x === '' ? '' : Number(x) })} />
          </SimpleGrid>
          <TextInput label="Описание" value={v.description} onChange={(e) => patch({ description: e.currentTarget.value })} />
          <Checkbox label="Главный сигнал (показывать на карточке машины)" checked={v.featured} onChange={(e) => patch({ featured: e.currentTarget.checked })} />
        </>
      )}
    </FormModal>
  );
}

const issueText = (e: unknown) =>
  e instanceof ApiError && e.fieldErrors.length
    ? [errorMessage(e), ...e.fieldErrors.map((f) => `${f.path || 'тело'}: ${f.message}`)]
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
        <NativeSelect label="Состояние по умолчанию" disabled={readOnly} value={defaultState} data={['IDLE', 'RUN', 'DOWN', 'SETUP', 'PLANNED_STOP']} onChange={(e) => setDefaultState(e.currentTarget.value)} />
        <NumberInput label="Нет данных через, мс" disabled={readOnly} min={1} value={offline} onChange={(v) => setOffline(v === '' ? '' : Number(v))} />
      </SimpleGrid>
      <Textarea label="Правила (JSON)" description="Массив правил: name, priority, targetState, enterCondition, exitCondition, activationDelayMs, releaseDelayMs" disabled={readOnly} autosize minRows={10} maxRows={24} ff="monospace" value={rules} onChange={(e) => setRules(e.currentTarget.value)} error={parseError} />
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
