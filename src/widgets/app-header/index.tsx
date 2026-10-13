import { ActionIcon, Anchor, Breadcrumbs, Burger, Button, Group, Menu, Select, Text, Tooltip, useMantineColorScheme } from '@mantine/core';
import { IconAlertCircle, IconDatabaseOff, IconBolt, IconCheck, IconChartBar, IconDeviceTv, IconLayoutGrid, IconLogout, IconMenu2, IconMoon, IconSettings, IconSun, IconUser } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useEnterpriseTree } from '@/entities/enterprise';
import { api } from '@/shared/api';
import { env } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { resetPersisted } from '@/shared/mocks/persist';
import { useAuth, useDashboardSearch, useEnterpriseChoice, useUiStore, type Role } from '@/shared/model';

const ROLES: Role[] = ['admin', 'master', 'viewer'];

type Section = { to: '/' | '/overview' | '/incidents' | '/generator' | '/admin'; label: string; icon: ReactNode; match: (path: string) => boolean };
const SECTIONS: Section[] = [
  { to: '/', label: 'Портал', icon: <IconLayoutGrid size={16} />, match: (p) => p === '/' },
  { to: '/overview', label: 'Мониторинг', icon: <IconChartBar size={16} />, match: (p) => p === '/overview' || p.startsWith('/machines/') },
  { to: '/incidents', label: 'Инциденты', icon: <IconAlertCircle size={16} />, match: (p) => p === '/incidents' },
  { to: '/generator', label: 'Генерация', icon: <IconBolt size={16} />, match: (p) => p === '/generator' },
  { to: '/admin', label: 'Администрирование', icon: <IconSettings size={16} />, match: (p) => p === '/admin' },
];

export function AppHeader({ showSidebar, mobileOpened, onToggleMobile }: { showSidebar: boolean; mobileOpened: boolean; onToggleMobile: () => void }) {
  const { t } = useTranslation();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const { sidebarCollapsed, toggleSidebar, role, setRole } = useUiStore();
  const [, update] = useDashboardSearch();
  const tree = useEnterpriseTree();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const params = useParams({ strict: false }) as { machineId?: string };
  const machine = tree.machines.find((m) => m.id === params.machineId);
  const line = tree.lines.find((l) => l.id === machine?.lineId);
  const monitoring = SECTIONS[1].match(path);
  const enableKiosk = () => update({ kiosk: true, refresh: '1m' });
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const qc = useQueryClient();
  const logout = () => {
    signOut();
    qc.clear();
  };

  const ents = useQuery(api.enterprises());
  const chosen = useEnterpriseChoice((s) => s.id);
  const choose = useEnterpriseChoice((s) => s.choose);
  const list = ents.data?.items ?? [];
  const current = list.find((e) => e.id === chosen) ?? list[0];
  const switchEnterprise = (id: string | null) => {
    if (!id || id === current?.id) return;
    choose(id);
    if (path.startsWith('/machines/')) void navigate({ to: '/overview' });
  };
  const active = SECTIONS.find((s) => s.match(path));

  return (
    <Group h="100%" px="sm" justify="space-between" wrap="nowrap" gap="sm">
      <Group gap="sm" wrap="nowrap" miw={0} style={{ flex: 1 }}>
        {showSidebar && (
          <>
            <Burger size="sm" hiddenFrom="md" opened={mobileOpened} onClick={onToggleMobile} aria-label="Дерево машин" />
            <Burger size="sm" visibleFrom="md" opened={!sidebarCollapsed} onClick={toggleSidebar} aria-label="Сайдбар" />
          </>
        )}
        <Text component={Link} to="/" fw={800} size="sm" c="orange.5" style={{ whiteSpace: 'nowrap', textDecoration: 'none' }}>
          {t('app.title')}
        </Text>

        <Group gap={2} visibleFrom="md" wrap="nowrap" component="nav" aria-label="Разделы">
          {SECTIONS.map((s) => {
            const on = s.match(path);
            return (
              <Button key={s.to} component={Link} to={s.to} size="compact-sm" variant={on ? 'light' : 'subtle'} color={on ? 'orange' : 'gray'} leftSection={s.icon} aria-current={on ? 'page' : undefined} style={{ flexShrink: 0 }}>
                {s.label}
              </Button>
            );
          })}
        </Group>
        <Menu position="bottom-start" withinPortal>
          <Menu.Target>
            <Button hiddenFrom="md" size="compact-sm" variant="light" color="orange" leftSection={<IconMenu2 size={16} />} aria-label="Разделы">
              {active?.label ?? 'Разделы'}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {SECTIONS.map((s) => (
              <Menu.Item key={s.to} component={Link} to={s.to} leftSection={s.icon} rightSection={s.match(path) ? <IconCheck size={14} /> : null}>
                {s.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>

        {monitoring && (
          <Breadcrumbs visibleFrom="lg" separatorMargin={6} miw={0} style={{ flexWrap: 'nowrap', overflow: 'hidden' }}>
            <Anchor component={Link} to="/overview" size="sm" c="dimmed" truncate>
              {tree.enterprise?.name ?? t('app.title')}
            </Anchor>
            {line && <Text size="sm" c="dimmed" truncate>{line.name}</Text>}
            {machine && <Text size="sm" fw={600} truncate>{machine.name}</Text>}
          </Breadcrumbs>
        )}
      </Group>

      <Group gap={8} wrap="nowrap">
        {list.length > 0 && (
          <Select
            visibleFrom="sm"
            size="xs"
            w={200}
            aria-label="Предприятие"
            allowDeselect={false}
            searchable={list.length > 8}
            data={list.map((e) => ({ value: e.id, label: e.name }))}
            value={current?.id ?? null}
            onChange={switchEnterprise}
          />
        )}
        <Select
          visibleFrom="xl"
          size="xs"
          w={170}
          aria-label={t('role.label')}
          data={ROLES.map((r) => ({ value: r, label: t(`role.${r}`) }))}
          value={role}
          allowDeselect={false}
          onChange={(v) => setRole(v as Role)}
        />
        {monitoring && (
          <Tooltip label="Режим киоска (Esc — выход)">
            <ActionIcon visibleFrom="sm" variant="default" size={30} onClick={enableKiosk} aria-label="Режим киоска">
              <IconDeviceTv size={16} />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip label={t('theme.toggle')}>
          <ActionIcon visibleFrom="sm" variant="default" size={30} onClick={toggleColorScheme} aria-label={t('theme.toggle')}>
            {colorScheme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
          </ActionIcon>
        </Tooltip>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="default" size={30} aria-label={user?.displayName ?? 'Профиль'}>
              <IconUser size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>{user?.displayName ?? user?.username}</Menu.Label>
            {list.length > 0 && (
              <>
                <Menu.Label hiddenFrom="sm">Предприятие</Menu.Label>
                {list.map((e) => (
                  <Menu.Item key={e.id} hiddenFrom="sm" onClick={() => switchEnterprise(e.id)} rightSection={current?.id === e.id ? <IconCheck size={14} /> : null}>
                    {e.name}
                  </Menu.Item>
                ))}
              </>
            )}
            <Menu.Label>{t('role.label')}</Menu.Label>
            {ROLES.map((r) => (
              <Menu.Item key={r} onClick={() => setRole(r)} rightSection={role === r ? <IconCheck size={14} /> : null}>
                {t(`role.${r}`)}
              </Menu.Item>
            ))}
            <Menu.Divider />
            <Menu.Item hiddenFrom="sm" leftSection={colorScheme === 'dark' ? <IconSun size={14} /> : <IconMoon size={14} />} onClick={toggleColorScheme}>
              {t('theme.toggle')}
            </Menu.Item>
            {monitoring && (
              <Menu.Item leftSection={<IconDeviceTv size={14} />} onClick={enableKiosk}>
                Режим киоска
              </Menu.Item>
            )}
            {env.apiMode === 'mock' && (
              <Menu.Item leftSection={<IconDatabaseOff size={14} />} onClick={() => window.confirm('Удалить все локальные демо-данные (предприятия, машины, сценарии, инциденты) и вернуть исходные?') && resetPersisted()}>
                Сбросить демо-данные
              </Menu.Item>
            )}
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<IconLogout size={14} />} onClick={logout}>
              {t('auth.logout')}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Group>
  );
}
