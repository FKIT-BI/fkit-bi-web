import { Badge, Box, Button, Card, Container, Group, SimpleGrid, Skeleton, Stack, Text, ThemeIcon, Title, UnstyledButton } from '@mantine/core';
import {
  IconAlertCircle,
  IconArrowRight,
  IconBolt,
  IconBuildingFactory2,
  IconPlus,
  IconSettings,
  IconTools,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { EnterpriseForm } from '@/features/enterprise-form';
import { api, type Enterprise } from '@/shared/api';
import { levelOf, STATE_CODES, STATE_META, type StateCode } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { formatPercent, runShare } from '@/shared/lib';
import { useAdminNav, useAuth, useEnterpriseChoice, useNow } from '@/shared/model';

const LEVEL_COLOR = { good: 'green', warn: 'yellow', bad: 'red' } as const;
const DAY_MS = 24 * 3600_000;

function EnterpriseCard({ enterprise, onOpen, onSetup }: { enterprise: Enterprise; onOpen: () => void; onSetup: () => void }) {
  const { t } = useTranslation();
  const now = useNow();
  const overview = useQuery({ ...api.overview(enterprise.id, now), placeholderData: (prev) => prev });
  const counts = useMemo(() => new Map((overview.data?.stateCounts ?? []).map((c) => [c.state as StateCode, c.count])), [overview.data]);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  // у пустого предприятия (без машин) бэкенд отвечает 404 на сводку — не спрашиваем
  const summary = useQuery({ ...api.summary('ENTERPRISE', enterprise.id, { from: now - DAY_MS, to: now }), placeholderData: (prev) => prev, retry: false, enabled: total > 0 });
  const lines = overview.data?.lines.length ?? 0;
  const metrics = summary.data?.current.metrics;
  const share = metrics ? runShare(metrics) : null;
  const level = levelOf(share);
  const stopped = (counts.get('DOWN') ?? 0) + (counts.get('IDLE') ?? 0);

  return (
    <UnstyledButton component="div" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }} aria-label={`Открыть ${enterprise.name}`} style={{ display: 'block', cursor: 'pointer' }}>
      <Card withBorder padding="lg" radius="md" h="100%" style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)', transition: 'transform .12s, border-color .12s' }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--mantine-color-orange-5)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--panel-border)'; e.currentTarget.style.transform = 'none'; }}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" miw={0}>
            <ThemeIcon size={40} radius="md" variant="light" color="orange"><IconBuildingFactory2 size={22} /></ThemeIcon>
            <Box miw={0}>
              <Text fw={700} lh={1.2} truncate>{enterprise.name}</Text>
              <Text size="xs" c="dimmed" truncate>{enterprise.code} · {enterprise.timezone}</Text>
            </Box>
          </Group>
          {stopped > 0 ? <Badge color="red" variant="light" leftSection={<IconAlertCircle size={12} />}>{stopped} стоят</Badge> : total > 0 ? <Badge color="green" variant="light">В норме</Badge> : null}
        </Group>

        <Group mt="lg" align="flex-end" justify="space-between" wrap="nowrap">
          <Box>
            <Text size="xs" c="dimmed">{t('overview.runShare')} · 24 ч</Text>
            {summary.isLoading && total > 0 ? <Skeleton h={36} w={90} mt={4} /> : (
              <Text fz={32} fw={800} lh={1.1} c={level ? `${LEVEL_COLOR[level as keyof typeof LEVEL_COLOR]}.5` : undefined}>{formatPercent(share, 0)}</Text>
            )}
          </Box>
          <Group gap="lg" wrap="nowrap">
            <Box ta="right"><Text fz={22} fw={700} lh={1.1}>{lines}</Text><Text size="xs" c="dimmed">линий</Text></Box>
            <Box ta="right"><Text fz={22} fw={700} lh={1.1}>{total}</Text><Text size="xs" c="dimmed">машин</Text></Box>
          </Group>
        </Group>

        <Box mt="md">
          {overview.isLoading ? <Skeleton h={8} /> : total > 0 ? (
            <>
              <Group gap={2} wrap="nowrap" h={8} style={{ borderRadius: 4, overflow: 'hidden' }} role="img" aria-label="Распределение машин по состояниям">
                {STATE_CODES.filter((s) => counts.get(s)).map((s) => <Box key={s} h="100%" style={{ flex: counts.get(s), background: STATE_META[s].color }} />)}
              </Group>
              <Group gap="sm" mt={6} wrap="wrap">
                {STATE_CODES.filter((s) => counts.get(s)).map((s) => (
                  <Group key={s} gap={4} wrap="nowrap">
                    <Box w={8} h={8} style={{ borderRadius: 4, background: STATE_META[s].color }} />
                    <Text size="xs" c="dimmed">{t(`state.${s}`)} {counts.get(s)}</Text>
                  </Group>
                ))}
              </Group>
            </>
          ) : <Text size="xs" c="dimmed">Активных машин пока нет — добавьте их в администрировании</Text>}
        </Box>

        <Group mt="md" justify="space-between" wrap="nowrap">
          <Button size="compact-sm" variant={total === 0 ? 'filled' : 'subtle'} color={total === 0 ? 'orange' : 'gray'} leftSection={<IconTools size={14} />} aria-label={`Настроить ${enterprise.name}`}
            onClick={(e) => { e.stopPropagation(); onSetup(); }} onKeyDown={(e) => e.stopPropagation()}>
            Настроить
          </Button>
          <Group gap={4} c="orange.5" wrap="nowrap"><Text size="sm" fw={600}>Открыть мониторинг</Text><IconArrowRight size={16} /></Group>
        </Group>
      </Card>
    </UnstyledButton>
  );
}

function Tile({ to, icon, title, text, onClick }: { to: '/generator' | '/admin' | '/incidents'; icon: React.ReactNode; title: string; text: string; onClick: () => void }) {
  return (
    <Card component={Link} to={to} onClick={onClick} withBorder padding="md" radius="md" style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)', textDecoration: 'none', color: 'inherit' }}>
      <Group wrap="nowrap" align="flex-start">
        <ThemeIcon size={36} radius="md" variant="light">{icon}</ThemeIcon>
        <Box><Text fw={600}>{title}</Text><Text size="sm" c="dimmed">{text}</Text></Box>
      </Group>
    </Card>
  );
}

export default function PortalPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const choose = useEnterpriseChoice((s) => s.choose);
  const chosen = useEnterpriseChoice((s) => s.id);
  const [creating, setCreating] = useState(false);
  const ents = useQuery(api.enterprises());
  const list = ents.data?.items ?? [];
  const current = list.find((e) => e.id === chosen) ?? list[0];

  const setupEnterprise = (id: string) => {
    choose(id);
    useAdminNav.getState().setTab('setup');
    void navigate({ to: '/admin' });
  };
  const open = (id: string) => {
    choose(id);
    void navigate({ to: '/overview' });
  };

  return (
    <>
      {creating && <EnterpriseForm item={null} onClose={() => setCreating(false)} onSaved={(e) => setupEnterprise(e.id)} />}
      <Container size="xl" py="xl">
        <Stack gap="xl">
          <Box>
            <Title order={1} fz={{ base: 24, sm: 30 }}>Здравствуйте{user?.displayName ? `, ${user.displayName}` : ''}</Title>
            <Text c="dimmed">Выберите предприятие, чтобы увидеть, как работают его машины и где теряется время.</Text>
          </Box>

          <Stack gap="sm">
            <Title order={2} fz="lg">Предприятия</Title>
            {ents.isError ? (
              <Card withBorder padding="lg"><Text c="red">Не удалось загрузить предприятия: {ents.error.message}</Text><Button mt="sm" variant="light" onClick={() => void ents.refetch()}>Повторить</Button></Card>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                {ents.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} h={230} radius="md" />)}
                {list.map((e) => <EnterpriseCard key={e.id} enterprise={e} onOpen={() => open(e.id)} onSetup={() => setupEnterprise(e.id)} />)}
                {!ents.isLoading && (
                  <UnstyledButton onClick={() => setCreating(true)} aria-label="Добавить предприятие" style={{ display: 'block' }}>
                    <Card withBorder padding="lg" radius="md" h="100%" style={{ borderStyle: 'dashed', background: 'transparent', minHeight: 140 }}>
                      <Stack align="center" justify="center" h="100%" gap={6}><ThemeIcon size={40} radius="xl" variant="light"><IconPlus size={22} /></ThemeIcon><Text fw={600}>Добавить предприятие</Text><Text size="xs" c="dimmed" ta="center">{list.length === 0 ? 'Начните с первого предприятия' : 'Новый завод, цех или площадка'}</Text></Stack>
                    </Card>
                  </UnstyledButton>
                )}
              </SimpleGrid>
            )}
          </Stack>

          {current && (
            <Stack gap="sm">
              <Group justify="space-between" align="baseline">
                <Title order={2} fz="lg">Инструменты</Title>
                <Text size="sm" c="dimmed">Для предприятия: <Text span fw={600} c="inherit">{current.name}</Text></Text>
              </Group>
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                <Tile to="/incidents" onClick={() => choose(current.id)} icon={<IconAlertCircle size={20} />} title="Журнал инцидентов" text="Простои без причины и ручные записи оператора" />
                <Tile to="/generator" onClick={() => choose(current.id)} icon={<IconBolt size={20} />} title="Генерация данных" text="Сценарии поведения оборудования и запуск имитации телеметрии" />
                <Tile to="/admin" onClick={() => choose(current.id)} icon={<IconSettings size={20} />} title="Администрирование" text="Предприятия, линии, машины, смены, причины потерь, правила состояний" />
              </SimpleGrid>
            </Stack>
          )}
        </Stack>
      </Container>
    </>
  );
}
