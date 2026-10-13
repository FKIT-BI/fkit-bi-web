import { ActionIcon, Badge, Button, Group, NumberInput, SimpleGrid, Stack, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { IconLock, IconPencil, IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { setup, type Shift } from '@/shared/api';
import { Panel } from '@/shared/ui';
import { confirmDisable, FormModal, setupKey, StatusBadge, StatusToggle, useStatusMutation } from './common';

const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

export function ShiftsTab({ enterpriseId, readOnly }: { enterpriseId: string; readOnly: boolean }) {
  const q = useQuery({ queryKey: setupKey('shifts', enterpriseId), queryFn: () => setup.shifts(enterpriseId), enabled: !!enterpriseId });
  const [edit, setEdit] = useState<Shift | 'new' | null>(null);
  const status = useStatusMutation<Shift>(setup.setShiftStatus, 'Смена');
  const items = (q.data ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">Смена, пересекающая полночь, задаётся временем окончания меньше начала (20:00 → 08:00).</Text>
        {!readOnly && <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setEdit('new')}>Новая смена</Button>}
      </Group>
      <Panel title={<>Смены <Badge variant="light" ml={6}>{items.length}</Badge></>} state={{ isLoading: q.isLoading, isError: q.isError, error: q.error, isEmpty: !q.isLoading && !items.length, refetch: () => void q.refetch() }}>
        <Table.ScrollContainer minWidth={620}>
          <Table highlightOnHover verticalSpacing={6}>
            <Table.Thead><Table.Tr><Table.Th>Код</Table.Th><Table.Th>Название</Table.Th><Table.Th>Время</Table.Th><Table.Th>Действует</Table.Th><Table.Th>Статус</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {items.map((s) => (
                <Table.Tr key={s.id}>
                  <Table.Td ff="monospace">{s.code}</Table.Td>
                  <Table.Td>{s.name}{s.used && <Tooltip label="Есть история — границы заблокированы"><IconLock size={12} style={{ marginLeft: 6, verticalAlign: 'middle' }} /></Tooltip>}</Table.Td>
                  <Table.Td>{s.startLocalTime} – {s.endLocalTime}</Table.Td>
                  <Table.Td>{s.validFrom} — {s.validTo ?? '∞'}</Table.Td>
                  <Table.Td><StatusBadge status={s.status} /></Table.Td>
                  <Table.Td>
                    {!readOnly && (
                      <Group gap={2} justify="flex-end" wrap="nowrap">
                        <ActionIcon variant="subtle" aria-label="Редактировать" onClick={() => setEdit(s)}><IconPencil size={16} /></ActionIcon>
                        <StatusToggle status={s.status} loading={status.isPending && status.variables?.item.id === s.id} onToggle={(next) => confirmDisable(s.name, next) && status.mutate({ item: s, status: next })} />
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Panel>
      {edit && <ShiftForm key={edit === 'new' ? 'new' : edit.id} enterpriseId={enterpriseId} item={edit === 'new' ? null : edit} nextOrder={items.length} onClose={() => setEdit(null)} />}
    </Stack>
  );
}

function ShiftForm({ enterpriseId, item, nextOrder, onClose }: { enterpriseId: string; item: Shift | null; nextOrder: number; onClose: () => void }) {
  const [code, setCode] = useState(item?.code ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [start, setStart] = useState(item?.startLocalTime ?? '08:00');
  const [end, setEnd] = useState(item?.endLocalTime ?? '20:00');
  const [from, setFrom] = useState(item?.validFrom ?? new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(item?.validTo ?? '');
  const [order, setOrder] = useState<number | ''>(item?.sortOrder ?? nextOrder);
  const locked = !!item?.used;
  return (
    <FormModal
      opened
      onClose={onClose}
      title={item ? 'Смена' : 'Новая смена'}
      success={item ? 'Смена сохранена' : 'Смена создана'}
      canSubmit={!!name.trim() && !!start && !!end && !!from && (!!item || CODE.test(code))}
      submit={() => {
        const common = { name: name.trim(), startLocalTime: start, endLocalTime: end, validFrom: from, validTo: to || null, sortOrder: Number(order || 0) };
        return item ? setup.updateShift(item.id, common) : setup.createShift(enterpriseId, { code, ...common });
      }}
    >
      {(fe) => (
        <>
          <SimpleGrid cols={2}>
            <TextInput label="Код" disabled={!!item} required value={code} error={fe('code')} onChange={(e) => setCode(e.currentTarget.value.toUpperCase())} />
            <NumberInput label="Порядок" min={0} value={order} error={fe('sortOrder')} onChange={(v) => setOrder(v === '' ? '' : Number(v))} />
          </SimpleGrid>
          <TextInput label="Название" required value={name} error={fe('name')} onChange={(e) => setName(e.currentTarget.value)} />
          <SimpleGrid cols={2}>
            <TextInput type="time" label="Начало" required disabled={locked} value={start} error={fe('startLocalTime')} onChange={(e) => setStart(e.currentTarget.value)} />
            <TextInput type="time" label="Конец" required disabled={locked} value={end} error={fe('endLocalTime')} onChange={(e) => setEnd(e.currentTarget.value)} />
            <TextInput type="date" label="Действует с" required disabled={locked} value={from} error={fe('validFrom')} onChange={(e) => setFrom(e.currentTarget.value)} />
            <TextInput type="date" label="Действует до" description="Пусто — бессрочно" value={to} error={fe('validTo')} onChange={(e) => setTo(e.currentTarget.value)} />
          </SimpleGrid>
          {locked && <Text size="xs" c="dimmed">У смены есть история, поэтому время и дата начала заблокированы. Чтобы изменить расписание — создайте новую смену.</Text>}
        </>
      )}
    </FormModal>
  );
}
