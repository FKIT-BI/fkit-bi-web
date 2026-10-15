import { ActionIcon, Badge, Button, Group, Stack, Table, Text, Tooltip } from '@mantine/core';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { setup, type Enterprise } from '@/shared/api';
import { enumLabel, TIMEZONE } from '@/shared/i18n';
import { Panel } from '@/shared/ui';
import { EnterpriseForm } from '@/features/enterprise-form';
import { confirmDisable, setupKey, StatusBadge, StatusToggle, useStatusMutation } from './common';


export function useEnterprises() {
  return useQuery({ queryKey: setupKey('enterprises-all'), queryFn: setup.allEnterprises });
}

export function EnterprisesTab({ readOnly }: { readOnly: boolean }) {
  const q = useEnterprises();
  const [edit, setEdit] = useState<Enterprise | 'new' | null>(null);
  const status = useStatusMutation<Enterprise>(setup.setEnterpriseStatus, 'Предприятие');
  const items = q.data ?? [];
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">Интерфейс показывает данные первого активного предприятия в списке.</Text>
        {!readOnly && <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setEdit('new')}>Новое предприятие</Button>}
      </Group>
      <Panel title={<>Предприятия <Badge variant="light" ml={6}>{items.length}</Badge></>} state={{ isLoading: q.isLoading, isError: q.isError, error: q.error, isEmpty: !q.isLoading && !items.length, refetch: () => void q.refetch() }}>
        <Table.ScrollContainer minWidth={560}>
          <Table highlightOnHover verticalSpacing={6}>
            <Table.Thead><Table.Tr><Table.Th>Код</Table.Th><Table.Th>Название</Table.Th><Table.Th>Часовой пояс</Table.Th><Table.Th>Статус</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {items.map((e) => (
                <Table.Tr key={e.id}>
                  <Table.Td ff="monospace">{e.code}</Table.Td>
                  <Table.Td>{e.name}</Table.Td>
                  <Table.Td>{enumLabel(TIMEZONE, e.timezone)}</Table.Td>
                  <Table.Td><StatusBadge status={e.status} /></Table.Td>
                  <Table.Td>
                    {!readOnly && (
                      <Group gap={2} justify="flex-end" wrap="nowrap">
                        <Tooltip label="Редактировать"><ActionIcon variant="subtle" aria-label="Редактировать" onClick={() => setEdit(e)}><IconPencil size={16} /></ActionIcon></Tooltip>
                        <StatusToggle status={e.status} loading={status.isPending && status.variables?.item.id === e.id} onToggle={(next) => confirmDisable(e.name, next) && status.mutate({ item: e, status: next })} />
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Panel>
      {edit && <EnterpriseForm key={edit === 'new' ? 'new' : edit.id} item={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </Stack>
  );
}
