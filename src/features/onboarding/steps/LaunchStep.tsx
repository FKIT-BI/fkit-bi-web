import { Alert, Anchor, Badge, Button, Card, Group, List, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconCheck, IconPlayerPlay, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { QuickGenerateModal } from '@/features/quick-generate';
import { describeConfig } from '@/features/state-rules';
import { setup } from '@/shared/api';
import { enumLabel, MACHINE_STATUS, SEMANTIC } from '@/shared/i18n';
import { useGeneratorNav } from '@/shared/model';
import { explain } from '../actions';
import { sk, type StepProps } from './types';

/** Куда вести «Исправить» по коду замечания готовности. */
const stepFor = (code: string) => (/SIGNAL/.test(code) ? 4 : /STATE|RULE/.test(code) ? 5 : /LINE|ASSIGN/.test(code) ? 2 : 3);

export function LaunchStep({ draft: d, register, goTo, onNextMachine }: StepProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [quick, setQuick] = useState(false);
  const enabled = !!d.machineId;
  const machine = useQuery({ queryKey: sk('machine', d.machineId), queryFn: () => setup.machine(d.machineId), enabled });
  const readiness = useQuery({ queryKey: sk('readiness', d.machineId), queryFn: () => setup.readiness(d.machineId), enabled, refetchOnMount: 'always' });
  const signals = useQuery({ queryKey: sk('signals-all', d.machineId), queryFn: () => setup.allSignals(d.machineId), enabled });
  const cfg = useQuery({ queryKey: sk('state-config', d.machineId), queryFn: () => setup.stateConfig(d.machineId), enabled });
  const lines = useQuery({ queryKey: sk('lines-all', d.enterpriseId), queryFn: () => setup.allLines(d.enterpriseId), enabled: !!d.enterpriseId });
  const enterprises = useQuery({ queryKey: sk('enterprises-all'), queryFn: setup.allEnterprises });
  const activate = useMutation({
    mutationFn: () => setup.setMachineStatus(d.machineId, 'ACTIVE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setup'] }),
  });
  register(async () => []);

  const m = machine.data;
  const r = readiness.data;
  const active = (signals.data ?? []).filter((s) => s.status === 'ACTIVE');
  const connected = m?.status === 'ACTIVE';

  if (connected) {
    return (
      <Stack gap="md" align="flex-start">
        <Group gap="sm">
          <ThemeIcon color="green" size={36} radius="xl"><IconCheck size={20} /></ThemeIcon>
          <div>
            <Title order={3} fz="lg">Машина «{m.name}» подключена</Title>
            <Text size="sm" c="dimmed">Она в мониторинге: по сигналам считаются состояния, простои и показатели.</Text>
          </div>
        </Group>
        <Group gap="sm" wrap="wrap">
          <Button leftSection={<IconPlayerPlay size={16} />} onClick={() => setQuick(true)}>Сгенерировать тестовые данные</Button>
          {onNextMachine && <Button variant="light" leftSection={<IconPlus size={16} />} onClick={onNextMachine}>Подключить ещё машину{d.lineId ? ' на эту линию' : ''}</Button>}
          <Button variant="default" component={Link} to="/overview">Открыть мониторинг</Button>
        </Group>
        <QuickGenerateModal opened={quick} onClose={() => setQuick(false)} onStarted={(id) => { useGeneratorNav.getState().showRun(id); void navigate({ to: '/generator' }); }} />
      </Stack>
    );
  }

  const enterprise = enterprises.data?.find((e) => e.id === d.enterpriseId);
  const line = lines.data?.find((l) => l.id === (m?.lineId ?? d.lineId));
  const rows: Array<[string, string, number]> = [
    ['Предприятие', enterprise?.name ?? '—', 0],
    ['Линия', line?.name ?? 'без линии', 2],
    ['Машина', m ? `${m.name}${m.machineType ? ` (${m.machineType})` : ''} — ${MACHINE_STATUS[m.status].label}` : '—', 3],
    ['Сигналы', active.length ? active.map((s) => `${s.name} (${enumLabel(SEMANTIC, s.semanticCode)})`).join(', ') : 'нет', 4],
  ];

  return (
    <Stack gap="md">
      <Card withBorder padding="sm">
        <Stack gap={6}>
          {rows.map(([k, v, step]) => (
            <Group key={k} gap="xs" wrap="nowrap" align="flex-start">
              <Text size="sm" c="dimmed" w={110} style={{ flexShrink: 0 }}>{k}</Text>
              <Text size="sm" style={{ flex: 1 }}>{v}</Text>
              <Anchor component="button" type="button" size="xs" onClick={() => goTo(step)}>Изменить</Anchor>
            </Group>
          ))}
          <Group gap="xs" wrap="nowrap" align="flex-start">
            <Text size="sm" c="dimmed" w={110} style={{ flexShrink: 0 }}>Состояние</Text>
            <div style={{ flex: 1 }}>
              {cfg.data ? (
                <List size="sm" spacing={0}>{describeConfig(cfg.data, active).map((l, i) => <List.Item key={i}>{l}</List.Item>)}</List>
              ) : (
                <Text size="sm">правила не сохранены</Text>
              )}
            </div>
            <Anchor component="button" type="button" size="xs" onClick={() => goTo(5)}>Изменить</Anchor>
          </Group>
        </Stack>
      </Card>

      {readiness.isLoading && <Text c="dimmed">Проверяем готовность…</Text>}
      {r && (
        <Alert color={r.ready ? 'green' : 'orange'} title={r.ready ? 'Всё готово к подключению' : 'Есть замечания, которые мешают подключению'}>
          <Stack gap={4}>
            {r.errors.map((e, i) => (
              <Group key={i} gap="xs">
                <Badge color="red" variant="light">ошибка</Badge>
                <Text size="sm">{e.message}</Text>
                <Anchor component="button" type="button" size="xs" onClick={() => goTo(stepFor(e.code))}>Исправить</Anchor>
              </Group>
            ))}
            {r.warnings.map((e, i) => (
              <Group key={i} gap="xs">
                <Badge color="yellow" variant="light">предупреждение</Badge>
                <Text size="sm">{e.message}</Text>
              </Group>
            ))}
            {r.ready && !r.warnings.length && <Text size="sm">Замечаний нет.</Text>}
          </Stack>
        </Alert>
      )}
      {activate.isError && <Alert color="red" p="xs">{explain(activate.error)} Машина осталась «Не подключена», настройка сохранена.</Alert>}
      <Group>
        <Button size="md" color="green" disabled={!r?.ready} loading={activate.isPending} onClick={() => activate.mutate()}>
          Подключить машину
        </Button>
      </Group>
    </Stack>
  );
}
