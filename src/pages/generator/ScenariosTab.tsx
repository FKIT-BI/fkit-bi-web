import { ActionIcon, Badge, Button, Group, Stack, Switch, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconCopy, IconPencil, IconPlayerPlay, IconPlus, IconPower, IconSearch } from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useEnterpriseTree } from '@/entities/enterprise';
import { ApiError, gen, gk, type ScenarioSummary } from '@/shared/api';
import { formatDateTime } from '@/shared/lib';
import { canAdminister, useUiStore } from '@/shared/model';
import { Panel } from '@/shared/ui';
import { CopyScenarioModal } from './CopyScenarioModal';
import { CYCLE_MODE } from './labels';
import { RunModal } from './RunModal';
import { ScenarioEditor } from './ScenarioEditor';

export function ScenariosTab({ onRunCreated }: { onRunCreated: (runId: string) => void }) {
  const tree = useEnterpriseTree();
  const qc = useQueryClient();
  const admin = canAdminister(useUiStore((s) => s.role));
  const enterpriseId = tree.enterprise?.id ?? '';
  const [showDisabled, setShowDisabled] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 300);
  const [editor, setEditor] = useState<{ id: string | null } | null>(null);
  const [runFor, setRunFor] = useState<string | null>(null);
  const [copyOf, setCopyOf] = useState<ScenarioSummary | null>(null);

  const q = useQuery({ ...gen.scenarios(enterpriseId, showDisabled ? 'DISABLED' : 'ACTIVE', debounced.trim() || undefined), enabled: !!enterpriseId, placeholderData: keepPreviousData });
  const toggle = useMutation({
    mutationFn: (s: ScenarioSummary) => gen.setScenarioStatus(s.id, s.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'),
    onSuccess: async (s) => {
      await qc.invalidateQueries({ queryKey: gk.scenarios });
      notifications.show({ color: 'green', message: s.status === 'ACTIVE' ? 'Сценарий активирован' : 'Сценарий отключён' });
    },
    onError: (e) =>
      notifications.show({ color: 'red', title: e.message, message: e instanceof ApiError ? e.fieldErrors.map((f) => f.message).join('\n') : undefined }),
  });

  const items = q.data?.items ?? [];
  return (
    <Stack gap="xs">
      <Group justify="space-between" wrap="wrap">
        <Group gap="md">
          <TextInput size="xs" w={240} leftSection={<IconSearch size={14} />} placeholder="Поиск по коду или названию" value={search} onChange={(e) => setSearch(e.currentTarget.value)} />
          <Switch size="xs" label="Отключённые" checked={showDisabled} onChange={(e) => setShowDisabled(e.currentTarget.checked)} />
        </Group>
        {admin && <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setEditor({ id: null })}>Новый сценарий</Button>}
      </Group>
      <Panel
        title={<>Сценарии <Badge variant="light" ml={6}>{items.length}</Badge></>}
        state={{ isLoading: q.isLoading, isError: q.isError, error: q.error, isEmpty: !q.isLoading && items.length === 0, refetch: () => void q.refetch() }}
      >
        <Table.ScrollContainer minWidth={680}>
          <Table highlightOnHover verticalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Сценарий</Table.Th>
                <Table.Th>Повтор</Table.Th>
                <Table.Th>Машин</Table.Th>
                <Table.Th>Фаз</Table.Th>
                <Table.Th>Изменён</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((s) => (
                <Table.Tr key={s.id}>
                  <Table.Td>
                    <Text size="sm" fw={500}>{s.name}</Text>
                    <Text size="xs" c="dimmed" ff="monospace">{s.code}</Text>
                  </Table.Td>
                  <Table.Td>{CYCLE_MODE[s.cycleMode]}</Table.Td>
                  <Table.Td>{s.machineCount}</Table.Td>
                  <Table.Td>{s.phaseCount}</Table.Td>
                  <Table.Td>{formatDateTime(Date.parse(s.updatedAt))}</Table.Td>
                  <Table.Td>
                    <Group gap={2} justify="flex-end" wrap="nowrap">
                      {admin && s.status === 'ACTIVE' && (
                        <Tooltip label="Запустить"><ActionIcon variant="subtle" color="green" onClick={() => setRunFor(s.id)} aria-label="Запустить"><IconPlayerPlay size={16} /></ActionIcon></Tooltip>
                      )}
                      {admin && (
                        <Tooltip label="Редактировать"><ActionIcon variant="subtle" onClick={() => setEditor({ id: s.id })} aria-label="Редактировать"><IconPencil size={16} /></ActionIcon></Tooltip>
                      )}
                      {admin && (
                        <Tooltip label="Копировать"><ActionIcon variant="subtle" onClick={() => setCopyOf(s)} aria-label="Копировать"><IconCopy size={16} /></ActionIcon></Tooltip>
                      )}
                      {admin && (
                        <Tooltip label={s.status === 'ACTIVE' ? 'Отключить' : 'Активировать'}>
                          <ActionIcon variant="subtle" color={s.status === 'ACTIVE' ? 'gray' : 'blue'} loading={toggle.isPending && toggle.variables?.id === s.id} onClick={() => toggle.mutate(s)} aria-label="Статус"><IconPower size={16} /></ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Panel>
      {!admin && <Text size="xs" c="dimmed">Редактирование доступно роли «Администратор» (переключатель в шапке).</Text>}
      <ScenarioEditor scenarioId={editor?.id ?? null} opened={!!editor} onClose={() => setEditor(null)} />
      <CopyScenarioModal
        source={copyOf}
        onClose={() => setCopyOf(null)}
        onCopied={(created) => {
          setCopyOf(null);
          setShowDisabled(true);
          setEditor({ id: created.id });
        }}
      />
      <RunModal opened={!!runFor} scenarioId={runFor ?? undefined} onClose={() => setRunFor(null)} onCreated={onRunCreated} />
    </Stack>
  );
}
