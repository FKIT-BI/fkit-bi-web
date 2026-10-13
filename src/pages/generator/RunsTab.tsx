import { ActionIcon, Badge, Button, Group, MultiSelect, NativeSelect, Progress, Stack, Table, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlayerStop, IconPlus, IconRefresh, IconRepeat } from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useEnterpriseTree } from '@/entities/enterprise';
import { gen, gk, isRunActive, type RunMode, type RunStatus } from '@/shared/api';
import { formatDateTime } from '@/shared/lib';
import { canAdminister, useUiStore } from '@/shared/model';
import { Panel } from '@/shared/ui';
import { RUN_MODE, RUN_STATUS } from './labels';
import { RunDrawer } from './RunDrawer';
import { RunModal } from './RunModal';

export function RunsTab({ focusRunId = null }: { focusRunId?: string | null }) {
  const tree = useEnterpriseTree();
  const qc = useQueryClient();
  const admin = canAdminister(useUiStore((s) => s.role));
  const enterpriseId = tree.enterprise?.id ?? '';
  const [statuses, setStatuses] = useState<RunStatus[]>([]);
  const [mode, setMode] = useState<RunMode | ''>('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(focusRunId);

  const q = useQuery({
    ...gen.runs(enterpriseId, { status: statuses.length ? statuses : undefined, mode: mode || undefined }),
    enabled: !!enterpriseId,
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (query.state.data?.items.some((r) => isRunActive(r.status)) ? 2000 : 15_000),
  });
  const scenarios = useQuery({ ...gen.scenarios(enterpriseId, 'ACTIVE'), enabled: !!enterpriseId });
  const disabledScenarios = useQuery({ ...gen.scenarios(enterpriseId, 'DISABLED'), enabled: !!enterpriseId });
  const nameOf = (id: string) => [...(scenarios.data?.items ?? []), ...(disabledScenarios.data?.items ?? [])].find((s) => s.id === id)?.name ?? id.slice(0, 8);

  const done = () => qc.invalidateQueries({ queryKey: gk.runs });
  const onError = (e: Error) => notifications.show({ color: 'red', message: e.message });
  const stop = useMutation({ mutationFn: gen.stopRun, onSuccess: done, onError });
  const retry = useMutation({ mutationFn: gen.retryRun, onSuccess: done, onError });

  const runs = q.data?.items ?? [];
  return (
    <Stack gap="xs">
      <Group justify="space-between" wrap="wrap">
        <Group gap="xs" wrap="wrap">
          <MultiSelect
            size="xs"
            w={260}
            placeholder="Статус: любой"
            clearable
            data={Object.entries(RUN_STATUS).map(([value, s]) => ({ value, label: s.label }))}
            value={statuses}
            onChange={(v) => setStatuses(v as RunStatus[])}
          />
          <NativeSelect size="xs" value={mode} onChange={(e) => setMode(e.currentTarget.value as RunMode | '')} data={[{ value: '', label: 'Режим: любой' }, ...Object.entries(RUN_MODE).map(([value, label]) => ({ value, label }))]} />
          <ActionIcon variant="subtle" onClick={() => void q.refetch()} aria-label="Обновить" loading={q.isFetching}><IconRefresh size={16} /></ActionIcon>
        </Group>
        {admin && <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setCreating(true)}>Новый запуск</Button>}
      </Group>
      <Panel
        title={<>Запуски <Badge variant="light" ml={6}>{runs.length}</Badge></>}
        state={{ isLoading: q.isLoading, isError: q.isError, error: q.error, isEmpty: !q.isLoading && runs.length === 0, refetch: () => void q.refetch() }}
      >
        <Table.ScrollContainer minWidth={760}>
          <Table highlightOnHover verticalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Сценарий</Table.Th>
                <Table.Th>Режим</Table.Th>
                <Table.Th>Статус</Table.Th>
                <Table.Th w={180}>Прогресс</Table.Th>
                <Table.Th>Запрошен</Table.Th>
                <Table.Th>Машин</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {runs.map((r) => {
                const st = RUN_STATUS[r.status];
                return (
                  <Table.Tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setOpenId(r.id)}>
                    <Table.Td>
                      <Text size="sm">{nameOf(r.scenarioId)}</Text>
                      {r.attemptNo > 1 && <Text size="xs" c="dimmed">попытка {r.attemptNo}</Text>}
                    </Table.Td>
                    <Table.Td>{RUN_MODE[r.mode]}</Table.Td>
                    <Table.Td><Badge color={st.color} variant="light">{st.label}</Badge></Table.Td>
                    <Table.Td>
                      {r.progress.progressPercent != null ? (
                        <Progress value={r.progress.progressPercent} size="sm" animated={r.status === 'RUNNING'} />
                      ) : (
                        <Text size="xs" c="dimmed">{isRunActive(r.status) ? 'без ограничения' : '—'}</Text>
                      )}
                    </Table.Td>
                    <Table.Td>{formatDateTime(Date.parse(r.requestedAt))}</Table.Td>
                    <Table.Td>{r.machineCount}</Table.Td>
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      {admin && (
                        <Group gap={2} justify="flex-end" wrap="nowrap">
                          {isRunActive(r.status) && r.status !== 'STOP_REQUESTED' && (
                            <Tooltip label={r.status === 'SCHEDULED' ? 'Отменить' : 'Остановить'}>
                              <ActionIcon variant="subtle" color="orange" loading={stop.isPending && stop.variables === r.id} onClick={() => stop.mutate(r.id)} aria-label="Остановить"><IconPlayerStop size={16} /></ActionIcon>
                            </Tooltip>
                          )}
                          {r.status === 'FAILED' && (
                            <Tooltip label="Повторить">
                              <ActionIcon variant="subtle" loading={retry.isPending && retry.variables === r.id} onClick={() => retry.mutate(r.id)} aria-label="Повторить"><IconRepeat size={16} /></ActionIcon>
                            </Tooltip>
                          )}
                        </Group>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Panel>
      <RunModal opened={creating} onClose={() => setCreating(false)} onCreated={setOpenId} />
      <RunDrawer runId={openId} onClose={() => setOpenId(null)} />
    </Stack>
  );
}
