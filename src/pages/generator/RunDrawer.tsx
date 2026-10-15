import { Alert, Badge, Button, Code, Drawer, Group, Progress, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEnterpriseTree } from '@/entities/enterprise';
import { gen, gk, isRunActive } from '@/shared/api';
import { formatDateTimeSec } from '@/shared/lib';
import { canAdminister, useUiStore } from '@/shared/model';
import { RUN_MODE, RUN_STATUS } from './labels';

const nf = new Intl.NumberFormat('ru-RU');
const dt = (v?: string | null) => (v ? formatDateTimeSec(Date.parse(v)) : '—');

export function RunDrawer({ runId, onClose }: { runId: string | null; onClose: () => void }) {
  const tree = useEnterpriseTree();
  const qc = useQueryClient();
  const admin = canAdminister(useUiStore((s) => s.role));
  const q = useQuery({ ...gen.run(runId ?? ''), enabled: !!runId });
  const run = q.data;
  const scenario = useQuery({ ...gen.scenario(run?.scenarioId ?? ''), enabled: !!run });

  const refresh = () => qc.invalidateQueries({ queryKey: gk.runs });
  const stop = useMutation({ mutationFn: () => gen.stopRun(runId!), onSuccess: refresh, onError: (e) => notifications.show({ color: 'red', message: e.message }) });
  const retry = useMutation({ mutationFn: () => gen.retryRun(runId!), onSuccess: refresh, onError: (e) => notifications.show({ color: 'red', message: e.message }) });

  const p = run?.progress;
  const st = run && RUN_STATUS[run.status];
  const rows: Array<[string, React.ReactNode]> = run
    ? [
        ['Сценарий', scenario.data ? `${scenario.data.name} (${scenario.data.code})` : run.scenarioId],
        ['Режим', RUN_MODE[run.mode]],
        ['Попытка', run.attemptNo],
        ['Seed', run.randomSeed],
        ['Запрошен', dt(run.requestedAt)],
        ['Плановый старт', dt(run.scheduledStartAt)],
        ['Начат', dt(run.startedAt)],
        ['Завершён', dt(run.finishedAt)],
        ['Период данных', run.eventFrom || run.eventTo ? `${dt(run.eventFrom)} — ${dt(run.eventTo)}` : '—'],
        ['Текущая фаза', p?.currentPhaseCode ?? '—'],
        ['Цикл', p ? nf.format(p.cycleNumber) : '—'],
        ['Сформировано до', dt(p?.generatedThrough)],
        ['Измерений сформировано', p ? nf.format(p.generatedMeasurements) : '—'],
        ['Записано', p ? nf.format(p.writtenMeasurements) : '—'],
        ['Потеряно', p ? nf.format(p.droppedMeasurements) : '—'],
        ['Неудачных пакетов', p ? nf.format(p.failedBatches) : '—'],
        ['Последняя запись', dt(p?.lastSuccessfulWriteAt)],
      ]
    : [];

  return (
    <Drawer opened={!!runId} onClose={onClose} position="right" size="md" title="Запуск генерации">
      {q.isLoading && <Text c="dimmed">Загрузка…</Text>}
      {q.isError && <Alert color="red">{q.error.message}</Alert>}
      {run && st && (
        <Stack gap="sm">
          <Group justify="space-between">
            <Badge color={st.color} size="lg">{st.label}</Badge>
            <Group gap="xs">
              {admin && isRunActive(run.status) && run.status !== 'STOP_REQUESTED' && (
                <Button size="compact-sm" color="orange" variant="light" loading={stop.isPending} onClick={() => stop.mutate()}>
                  {run.status === 'SCHEDULED' ? 'Отменить' : 'Остановить'}
                </Button>
              )}
              {admin && run.status === 'FAILED' && run.failure?.retryable && (
                <Button size="compact-sm" loading={retry.isPending} onClick={() => retry.mutate()}>Повторить</Button>
              )}
            </Group>
          </Group>
          {p?.progressPercent != null && (
            <Progress.Root size="lg"><Progress.Section value={p.progressPercent} animated={run.status === 'RUNNING'}><Progress.Label>{p.progressPercent.toFixed(0)}%</Progress.Label></Progress.Section></Progress.Root>
          )}
          {run.failure && (
            <Alert color="red" title="Запуск завершился ошибкой">
              <Text size="sm">{run.failure.message}</Text>
              <Text size="xs" c="dimmed">{dt(run.failure.failedAt)} · {run.failure.retryable ? 'можно повторить' : 'повтор невозможен'} · код для поддержки: {run.failure.code}</Text>
            </Alert>
          )}
          <Table withRowBorders={false} verticalSpacing={4}>
            <Table.Tbody>
              {rows.map(([k, v]) => (
                <Table.Tr key={k}>
                  <Table.Td c="dimmed" w="45%">{k}</Table.Td>
                  <Table.Td>{v}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Text size="sm" fw={600}>Машины ({run.machineIds.length})</Text>
          <Group gap={6}>
            {run.machineIds.map((id) => {
              const m = tree.machines.find((x) => x.id === id);
              return m ? (
                <Link key={id} to="/machines/$machineId" params={{ machineId: id }} style={{ textDecoration: 'none' }}><Badge variant="outline" style={{ cursor: 'pointer' }}>{m.name}</Badge></Link>
              ) : (
                <Code key={id}>{id.slice(0, 8)}</Code>
              );
            })}
          </Group>
        </Stack>
      )}
    </Drawer>
  );
}
