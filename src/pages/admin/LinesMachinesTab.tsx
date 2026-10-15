import { ActionIcon, Autocomplete, Badge, Button, Group, NativeSelect, NumberInput, SimpleGrid, Stack, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { IconListDetails, IconPencil, IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAdminNav } from '@/shared/model';
import { setup, type Machine, type MeasurementUnit, type ProductionLine, type TypedParameter } from '@/shared/api';
import { HINT } from '@/shared/i18n';
import { CodeField, HintLabel, Panel, useAutoCode } from '@/shared/ui';
import { confirmDisable, FormModal, setupKey, StatusBadge, StatusToggle, useStatusMutation } from './common';
import { rateUnitError, unitOptions, unitSymbol } from './units';
import { MachineDrawer } from './MachineDrawer';
import { ParametersEditor } from './ParametersEditor';

const MACHINE_TYPES = ['Экструдер', 'Пресс', 'Термопластавтомат', 'Упаковочная машина', 'Станок ЧПУ', 'Конвейер', 'Миксер', 'Печатная машина', 'Ламинатор', 'Резательная машина'];

export function LinesMachinesTab({ enterpriseId, readOnly }: { enterpriseId: string; readOnly: boolean }) {
  const lines = useQuery({ queryKey: setupKey('lines-all', enterpriseId), queryFn: () => setup.allLines(enterpriseId), enabled: !!enterpriseId });
  const machines = useQuery({ queryKey: setupKey('machines', enterpriseId), queryFn: () => setup.machines(enterpriseId), enabled: !!enterpriseId });
  const units = useQuery({ queryKey: setupKey('measurement-units'), queryFn: setup.measurementUnits, staleTime: Infinity });
  const [lineEdit, setLineEdit] = useState<ProductionLine | 'new' | null>(null);
  const [machineEdit, setMachineEdit] = useState<Machine | 'new' | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const nav = useAdminNav();
  const [drawerTab, setDrawerTab] = useState<'passport' | 'components' | 'signals' | 'states'>('passport');
  useEffect(() => {
    if (!nav.machineId) return;
    setDrawerId(nav.machineId);
    setDrawerTab(nav.machineTab);
    nav.clearMachine();
  }, [nav.machineId]); // eslint-disable-line react-hooks/exhaustive-deps
  const lineStatus = useStatusMutation<ProductionLine>(setup.setLineStatus, 'Линия');
  const machineStatus = useStatusMutation<Machine>(setup.setMachineStatus, 'Машина');
  const lineList = (lines.data ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const machineList = (machines.data ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const lineName = (id: string | null | undefined) => lineList.find((l) => l.id === id)?.name ?? '—';

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Group justify="flex-end">{!readOnly && <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setLineEdit('new')}>Новая линия</Button>}</Group>
        <Panel title={<>Линии <Badge variant="light" ml={6}>{lineList.length}</Badge></>} state={{ isLoading: lines.isLoading, isError: lines.isError, error: lines.error, isEmpty: !lines.isLoading && !lineList.length, refetch: () => void lines.refetch() }}>
          <Table.ScrollContainer minWidth={520}>
            <Table highlightOnHover verticalSpacing={6}>
              <Table.Thead><Table.Tr><Table.Th>Код</Table.Th><Table.Th>Название</Table.Th><Table.Th>Машин</Table.Th><Table.Th>Статус</Table.Th><Table.Th /></Table.Tr></Table.Thead>
              <Table.Tbody>
                {lineList.map((l) => (
                  <Table.Tr key={l.id}>
                    <Table.Td ff="monospace">{l.code}</Table.Td>
                    <Table.Td>{l.name}</Table.Td>
                    <Table.Td>{machineList.filter((m) => m.lineId === l.id).length}</Table.Td>
                    <Table.Td><StatusBadge status={l.status} /></Table.Td>
                    <Table.Td>
                      {!readOnly && (
                        <Group gap={2} justify="flex-end" wrap="nowrap">
                          <ActionIcon variant="subtle" aria-label="Редактировать линию" onClick={() => setLineEdit(l)}><IconPencil size={16} /></ActionIcon>
                          <StatusToggle status={l.status} loading={lineStatus.isPending && lineStatus.variables?.item.id === l.id} onToggle={(next) => confirmDisable(l.name, next) && lineStatus.mutate({ item: l, status: next })} />
                        </Group>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Panel>
      </Stack>

      <Stack gap="xs">
        <Group justify="flex-end">{!readOnly && <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setMachineEdit('new')}>Новая машина</Button>}</Group>
        <Panel title={<>Машины <Badge variant="light" ml={6}>{machineList.length}</Badge></>} state={{ isLoading: machines.isLoading, isError: machines.isError, error: machines.error, isEmpty: !machines.isLoading && !machineList.length, refetch: () => void machines.refetch() }}>
          <Table.ScrollContainer minWidth={760}>
            <Table highlightOnHover verticalSpacing={6}>
              <Table.Thead><Table.Tr><Table.Th>Код</Table.Th><Table.Th>Название</Table.Th><Table.Th>Линия</Table.Th><Table.Th>Тип</Table.Th><Table.Th>Норма</Table.Th><Table.Th>Статус</Table.Th><Table.Th /></Table.Tr></Table.Thead>
              <Table.Tbody>
                {machineList.map((m) => (
                  <Table.Tr key={m.id}>
                    <Table.Td ff="monospace">{m.code}</Table.Td>
                    <Table.Td>{m.name}</Table.Td>
                    <Table.Td>{lineName(m.lineId)}</Table.Td>
                    <Table.Td>{m.machineType ?? '—'}</Table.Td>
                    <Table.Td>{m.nominalRate ? `${m.nominalRate} ${unitSymbol(units.data ?? [], m.productionUnit)}/ч` : '—'}</Table.Td>
                    <Table.Td><StatusBadge machine status={m.status} /></Table.Td>
                    <Table.Td>
                      <Group gap={2} justify="flex-end" wrap="nowrap">
                        <Tooltip label="Компоненты, сигналы, правила состояний"><ActionIcon variant="subtle" aria-label="Детали машины" onClick={() => { setDrawerTab('passport'); setDrawerId(m.id); }}><IconListDetails size={16} /></ActionIcon></Tooltip>
                        {!readOnly && <ActionIcon variant="subtle" aria-label="Редактировать машину" onClick={() => setMachineEdit(m)}><IconPencil size={16} /></ActionIcon>}
                        {!readOnly && <StatusToggle status={m.status} loading={machineStatus.isPending && machineStatus.variables?.item.id === m.id} onToggle={(next) => confirmDisable(m.name, next) && machineStatus.mutate({ item: m, status: next })} />}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Panel>
      </Stack>

      {lineEdit && <LineForm key={lineEdit === 'new' ? 'new' : lineEdit.id} enterpriseId={enterpriseId} item={lineEdit === 'new' ? null : lineEdit} taken={lineList.map((l) => l.code)} nextOrder={lineList.length} onClose={() => setLineEdit(null)} />}
      {machineEdit && <MachineForm key={machineEdit === 'new' ? 'new' : machineEdit.id} enterpriseId={enterpriseId} lines={lineList.filter((l) => l.status === 'ACTIVE')} units={units.data ?? []} item={machineEdit === 'new' ? null : machineEdit} taken={machineList.map((m) => m.code)} nextOrder={machineList.length} onClose={() => setMachineEdit(null)} />}
      <MachineDrawer machineId={drawerId} initialTab={drawerTab} readOnly={readOnly} onClose={() => { setDrawerId(null); setDrawerTab('passport'); }} />
    </Stack>
  );
}

function LineForm({ enterpriseId, item, taken, nextOrder, onClose }: { enterpriseId: string; item: ProductionLine | null; taken: string[]; nextOrder: number; onClose: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const code = useAutoCode(name, 'LINE', taken, item?.code);
  const [order, setOrder] = useState<number | ''>(item?.sortOrder ?? nextOrder);
  return (
    <FormModal opened onClose={onClose} title={item ? 'Линия' : 'Новая линия'} success={item ? 'Линия сохранена' : 'Линия создана'} canSubmit={!!name.trim() && code.valid}
      submit={() => (item ? setup.updateLine(item.id, { name: name.trim(), sortOrder: Number(order || 0) }) : setup.createLine(enterpriseId, { code: code.value, name: name.trim(), sortOrder: Number(order || 0) }))}>
      {(fe) => (
        <>
          <TextInput label="Название" description="Группа машин, работающих вместе: например, «Линия экструзии 1»" required data-autofocus value={name} error={fe('name')} onChange={(e) => setName(e.currentTarget.value)} />
          <CodeField code={code} locked={!!item} error={fe('code')} />
          <NumberInput label="Порядок" min={0} value={order} error={fe('sortOrder')} onChange={(v) => setOrder(v === '' ? '' : Number(v))} />
        </>
      )}
    </FormModal>
  );
}

function MachineForm({ enterpriseId, lines, units, item, taken, nextOrder, onClose }: { enterpriseId: string; lines: ProductionLine[]; units: MeasurementUnit[]; item: Machine | null; taken: string[]; nextOrder: number; onClose: () => void }) {
  const [v, setV] = useState({
    name: item?.name ?? '',
    lineId: item?.lineId ?? '',
    machineType: item?.machineType ?? '',
    inventoryNo: item?.inventoryNo ?? '',
    manufacturer: item?.manufacturer ?? '',
    model: item?.model ?? '',
    year: item?.commissioningYear ?? ('' as number | ''),
    nominalRate: item?.nominalRate ?? ('' as number | ''),
    productionUnit: item?.productionUnit ?? '',
    sortOrder: item?.sortOrder ?? (nextOrder as number | ''),
  });
  const [params, setParams] = useState<TypedParameter[]>(item?.parameters ?? []);
  const patch = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  const text = (s: string) => s.trim() || null;
  const pairError = rateUnitError(v.nominalRate, v.productionUnit);
  const code = useAutoCode(v.name, 'M', taken, item?.code);
  return (
    <FormModal opened onClose={onClose} size="lg" title={item ? 'Машина' : 'Новая машина'} success={item ? 'Машина сохранена' : 'Машина создана (отключена до активации)'} canSubmit={!!v.name.trim() && code.valid && !pairError.nominalRate && !pairError.productionUnit}
      submit={() => {
        const common = {
          name: v.name.trim(),
          machineType: text(v.machineType),
          inventoryNo: text(v.inventoryNo),
          manufacturer: text(v.manufacturer),
          model: text(v.model),
          commissioningYear: v.year === '' ? null : Number(v.year),
          nominalRate: v.nominalRate === '' ? null : Number(v.nominalRate),
          productionUnit: text(v.productionUnit),
          sortOrder: v.sortOrder === '' ? null : Number(v.sortOrder),
          parameters: params,
        };
        return item ? setup.updateMachine(item.id, common) : setup.createMachine(enterpriseId, { code: code.value, lineId: v.lineId || null, ...common });
      }}>
      {(fe) => (
        <>
          <SimpleGrid cols={{ base: 1, xs: 2 }}>
            <TextInput label="Название" placeholder="Экструдер Э-1" required data-autofocus value={v.name} error={fe('name')} onChange={(e) => patch({ name: e.currentTarget.value })} />
            <NativeSelect label="Линия" disabled={!!item} description={item ? 'Назначение линии — отдельной операцией' : undefined} value={v.lineId} error={fe('lineId')} data={[{ value: '', label: 'Не назначена' }, ...lines.map((l) => ({ value: l.id, label: l.name }))]} onChange={(e) => patch({ lineId: e.currentTarget.value })} />
            <Autocomplete label={<HintLabel hint={HINT.machineType}>Тип машины</HintLabel>} data={MACHINE_TYPES} value={v.machineType} error={fe('machineType')} onChange={(x) => patch({ machineType: x })} />
            <TextInput label="Инвентарный номер" value={v.inventoryNo} onChange={(e) => patch({ inventoryNo: e.currentTarget.value })} />
            <TextInput label="Производитель" value={v.manufacturer} onChange={(e) => patch({ manufacturer: e.currentTarget.value })} />
            <TextInput label="Модель" value={v.model} onChange={(e) => patch({ model: e.currentTarget.value })} />
            <NumberInput label="Год ввода" min={1900} max={9999} allowDecimal={false} value={v.year} error={fe('commissioningYear')} onChange={(x) => patch({ year: x === '' ? '' : Number(x) })} />
            <NumberInput label={<HintLabel hint={HINT.nominalRate}>Норма выпуска в час</HintLabel>} min={0} value={v.nominalRate} error={pairError.nominalRate ?? fe('nominalRate')} onChange={(x) => patch({ nominalRate: x === '' ? '' : Number(x) })} />
            <NativeSelect label="Единица выпуска" value={v.productionUnit} error={pairError.productionUnit ?? fe('productionUnit')} data={unitOptions(units, v.productionUnit, 'Не выбрана')} onChange={(e) => patch({ productionUnit: e.currentTarget.value })} />
            <NumberInput label="Порядок" min={0} value={v.sortOrder} onChange={(x) => patch({ sortOrder: x === '' ? '' : Number(x) })} />
          </SimpleGrid>
          <CodeField code={code} locked={!!item} error={fe('code')} />
          <ParametersEditor value={params} units={units} errorFor={fe} onChange={setParams} />
          {fe('parameters') && <Text size="xs" c="red">{fe('parameters')}</Text>}
        </>
      )}
    </FormModal>
  );
}
