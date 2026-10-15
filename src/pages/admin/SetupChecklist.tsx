import { Alert, Badge, Box, Button, Card, Group, Progress, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconCircle, IconCircleDashed } from '@tabler/icons-react';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { QuickGenerateModal } from '@/features/quick-generate';
import type { ReactNode } from 'react';
import { setup, type Machine } from '@/shared/api';
import { useAdminNav, useGeneratorNav } from '@/shared/model';
import { errorMessage, setupKey, useRefreshConfig } from './common';

interface Step {
  id: string;
  title: string;
  hint: string;
  done: boolean;
  optional?: boolean;
  detail?: ReactNode;
  action?: ReactNode;
}

/** Пошаговая настройка предприятия: что уже сделано и что мешает запустить мониторинг. */
export function SetupChecklist({ enterpriseId, readOnly }: { enterpriseId: string; readOnly: boolean }) {
  const nav = useAdminNav();
  const navigate = useNavigate();
  const [quick, setQuick] = useState(false);
  const refresh = useRefreshConfig();
  const enabled = !!enterpriseId;
  const shifts = useQuery({ queryKey: setupKey('shifts', enterpriseId), queryFn: () => setup.shifts(enterpriseId), enabled });
  const reasons = useQuery({ queryKey: setupKey('loss-reasons', enterpriseId), queryFn: () => setup.lossReasons(enterpriseId), enabled });
  const lines = useQuery({ queryKey: setupKey('lines-all', enterpriseId), queryFn: () => setup.allLines(enterpriseId), enabled });
  const machines = useQuery({ queryKey: setupKey('machines', enterpriseId), queryFn: () => setup.machines(enterpriseId), enabled });
  const list = machines.data ?? [];
  const readiness = useQueries({ queries: list.map((m) => ({ queryKey: setupKey('readiness', m.id), queryFn: () => setup.readiness(m.id) })) });
  const activate = useMutation({
    mutationFn: (m: Machine) => setup.setMachineStatus(m.id, 'ACTIVE'),
    onSuccess: async (_r, m) => {
      await refresh();
      notifications.show({ color: 'green', message: `Машина «${m.name}» активирована` });
    },
    onError: (e) => notifications.show({ color: 'red', title: 'Не удалось активировать', message: errorMessage(e) }),
  });

  const active = <T extends { status: string }>(items: T[] | undefined) => (items ?? []).filter((i) => i.status === 'ACTIVE').length;
  const readyOf = (i: number) => readiness[i]?.data;
  const notActive = list.map((m, i) => ({ m, r: readyOf(i) })).filter(({ m }) => m.status !== 'ACTIVE');
  const activeMachines = list.filter((m) => m.status === 'ACTIVE').length;
  const go = (tab: string, label: string) => (
    <Button size="compact-sm" variant="light" onClick={() => nav.setTab(tab)}>{label}</Button>
  );

  const blocked = notActive.filter(({ r }) => r && !r.ready);
  const readyToActivate = notActive.filter(({ r }) => r?.ready);
  const steps: Step[] = [
    { id: 'shifts', title: 'Смены', hint: 'По сменам считаются периоды и хронометраж', done: active(shifts.data) > 0, detail: `${active(shifts.data)} активных`, action: !readOnly && go('shifts', 'Задать смены') },
    { id: 'reasons', title: 'Причины потерь', hint: 'Из них оператор выбирает причину простоя', optional: true, done: active(reasons.data) > 0, detail: `${active(reasons.data)} активных`, action: !readOnly && go('reasons', 'Заполнить справочник') },
    { id: 'lines', title: 'Линии', hint: 'Группируют машины на схеме и в отчётах', done: active(lines.data) > 0, detail: `${active(lines.data)} активных`, action: !readOnly && go('equipment', 'Добавить линию') },
    { id: 'machines', title: 'Машины', hint: 'Паспорт, норма выпуска, линия', done: list.length > 0, detail: `${list.length} всего`, action: !readOnly && go('wizard', 'Подключить машину') },
    {
      id: 'config',
      title: 'Сигналы и правила состояний',
      hint: 'Без них машину нельзя активировать',
      done: list.length > 0 && blocked.length === 0 && readiness.every((q) => q.isSuccess),
      detail: blocked.length ? (
        <Stack gap={6} mt={4}>
          {blocked.map(({ m, r }) => (
            <Group key={m.id} gap="xs" wrap="wrap">
              <Text size="sm" fw={500}>{m.name}</Text>
              {r!.errors.map((e) => <Badge key={e.code} color="red" variant="light">{e.message}</Badge>)}
              {!readOnly && <Button size="compact-xs" variant="light" onClick={() => nav.resumeMachine(m.id)}>Продолжить настройку</Button>}
            </Group>
          ))}
        </Stack>
      ) : list.length ? 'У всех неактивных машин настроено' : 'Появится после добавления машин',
    },
    {
      id: 'activate',
      title: 'Активация машин',
      hint: 'Активные машины попадают в мониторинг',
      done: activeMachines > 0,
      detail: (
        <Stack gap={6} mt={4}>
          <Text size="sm" c="dimmed">{activeMachines} активных из {list.length}</Text>
          {readyToActivate.map(({ m }) => (
            <Group key={m.id} gap="xs">
              <Text size="sm" fw={500}>{m.name}</Text>
              <Badge color="green" variant="light">готова</Badge>
              {!readOnly && <Button size="compact-xs" loading={activate.isPending && activate.variables?.id === m.id} onClick={() => activate.mutate(m)}>Активировать</Button>}
            </Group>
          ))}
        </Stack>
      ),
    },
  ];
  steps.push({
    id: 'data',
    title: 'Данные для отчётов',
    hint: 'Сгенерируйте телеметрию — по ней посчитаются простои и показатели',
    optional: true,
    done: false,
    detail: activeMachines > 0 ? 'Автоматический сценарий: история за период или поток в реальном времени' : 'Станет доступно после активации хотя бы одной машины',
    action: !readOnly && activeMachines > 0 && <Button size="compact-sm" onClick={() => setQuick(true)}>Сгенерировать данные</Button>,
  });
  const required = steps.filter((s) => !s.optional);
  const doneCount = required.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done && !s.optional);
  const loading = [shifts, reasons, lines, machines].some((q) => q.isLoading);

  return (
    <Stack gap="md" maw={820}>
      <Box>
        <Title order={2} fz="lg">Пошаговая настройка</Title>
        <Text size="sm" c="dimmed">Что уже настроено и что мешает мониторингу. Быстрее всего подключить машину через мастер — он проведёт по всем шагам.</Text>
        {!readOnly && <Button mt="xs" onClick={() => nav.setTab('wizard')}>Подключить машину</Button>}
      </Box>
      <Progress value={(doneCount / required.length) * 100} size="sm" aria-label="Прогресс настройки" />
      {readOnly && <Alert color="gray" p="xs">Режим просмотра: для изменений выберите роль «Администратор».</Alert>}
      {steps.map((s, i) => {
        const current = next?.id === s.id;
        return (
          <Card key={s.id} withBorder padding="md" radius="md" style={{ background: 'var(--panel-bg)', borderColor: current ? 'var(--mantine-color-orange-5)' : 'var(--panel-border)' }}>
            <Group align="flex-start" wrap="nowrap" gap="md">
              <ThemeIcon size={28} radius="xl" variant={s.done ? 'filled' : 'light'} color={s.done ? 'green' : current ? 'orange' : 'gray'}>
                {s.done ? <IconCheck size={16} /> : current ? <IconCircleDashed size={16} /> : <IconCircle size={16} />}
              </ThemeIcon>
              <Box style={{ flex: 1 }} miw={0}>
                <Group gap="xs" justify="space-between" wrap="wrap">
                  <Group gap="xs"><Text fw={600}>{i + 1}. {s.title}</Text>{s.optional && <Badge variant="outline" color="gray" size="sm">рекомендуется</Badge>}</Group>
                  {!s.done || ['shifts', 'lines', 'machines', 'data'].includes(s.id) ? s.action : null}
                </Group>
                <Text size="sm" c="dimmed">{s.hint}</Text>
                {loading ? <Text size="sm" c="dimmed" mt={4}>Загрузка…</Text> : typeof s.detail === 'string' ? <Text size="sm" mt={4}>{s.detail}</Text> : s.detail}
              </Box>
            </Group>
          </Card>
        );
      })}
      {!loading && activeMachines > 0 && (
        <Group><Button component={Link} to="/overview">Открыть мониторинг</Button></Group>
      )}
      <QuickGenerateModal opened={quick} onClose={() => setQuick(false)} onStarted={(id) => { useGeneratorNav.getState().showRun(id); void navigate({ to: '/generator' }); }} />
    </Stack>
  );
}
