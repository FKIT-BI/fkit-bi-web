import { ActionIcon, Anchor, Breadcrumbs, Burger, Group, Menu, Select, Text, Tooltip, useMantineColorScheme } from '@mantine/core';
import { IconCheck, IconDeviceTv, IconMoon, IconSettings, IconSun } from '@tabler/icons-react';
import { Link, useParams } from '@tanstack/react-router';
import { useEnterpriseTree } from '@/entities/enterprise';
import { useTranslation } from '@/shared/i18n';
import { useDashboardSearch, useUiStore, type Role } from '@/shared/model';

const ROLES: Role[] = ['admin', 'master', 'viewer'];

export function AppHeader({ title, mobileOpened, onToggleMobile }: { title?: string; mobileOpened: boolean; onToggleMobile: () => void }) {
  const { t } = useTranslation();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const { sidebarCollapsed, toggleSidebar, role, setRole } = useUiStore();
  const [, update] = useDashboardSearch();
  const tree = useEnterpriseTree();
  const params = useParams({ strict: false }) as { machineId?: string };
  const machine = tree.machines.find((m) => m.id === params.machineId);
  const line = tree.lines.find((l) => l.id === machine?.lineId);
  const current = machine?.name ?? title;
  const enableKiosk = () => update({ kiosk: true, refresh: '1m' });

  return (
    <Group h="100%" px="sm" justify="space-between" wrap="nowrap" gap="sm">
      <Group gap="sm" wrap="nowrap" miw={0} style={{ flex: 1 }}>
        <Burger size="sm" hiddenFrom="md" opened={mobileOpened} onClick={onToggleMobile} aria-label="Меню" />
        <Burger size="sm" visibleFrom="md" opened={!sidebarCollapsed} onClick={toggleSidebar} aria-label="Сайдбар" />
        <Text fw={800} size="sm" c="orange.5" style={{ whiteSpace: 'nowrap' }}>
          {t('app.title')}
        </Text>
        <Breadcrumbs visibleFrom="sm" separatorMargin={6} miw={0} style={{ flexWrap: 'nowrap', overflow: 'hidden' }}>
          <Anchor component={Link} to="/" size="sm" c="dimmed" truncate>
            {tree.enterprise?.name ?? t('app.title')}
          </Anchor>
          {line && (
            <Text size="sm" c="dimmed" truncate visibleFrom="lg">
              {line.name}
            </Text>
          )}
          {current && (
            <Text size="sm" fw={600} truncate>
              {current}
            </Text>
          )}
        </Breadcrumbs>
        {current && (
          <Text size="sm" fw={600} truncate hiddenFrom="sm" miw={0}>
            {current}
          </Text>
        )}
      </Group>

      <Group gap={8} wrap="nowrap">
        <Select
          visibleFrom="lg"
          size="xs"
          w={170}
          aria-label={t('role.label')}
          data={ROLES.map((r) => ({ value: r, label: t(`role.${r}`) }))}
          value={role}
          allowDeselect={false}
          onChange={(v) => setRole(v as Role)}
        />
        <Tooltip label="Режим киоска (Esc — выход)">
          <ActionIcon visibleFrom="sm" variant="default" size={30} onClick={enableKiosk} aria-label="Режим киоска">
            <IconDeviceTv size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t('theme.toggle')}>
          <ActionIcon visibleFrom="sm" variant="default" size={30} onClick={toggleColorScheme} aria-label={t('theme.toggle')}>
            {colorScheme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
          </ActionIcon>
        </Tooltip>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon hiddenFrom="lg" variant="default" size={30} aria-label="Настройки">
              <IconSettings size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>{t('role.label')}</Menu.Label>
            {ROLES.map((r) => (
              <Menu.Item key={r} onClick={() => setRole(r)} rightSection={role === r ? <IconCheck size={14} /> : null}>
                {t(`role.${r}`)}
              </Menu.Item>
            ))}
            <Menu.Divider />
            <Menu.Item leftSection={colorScheme === 'dark' ? <IconSun size={14} /> : <IconMoon size={14} />} onClick={toggleColorScheme}>
              {t('theme.toggle')}
            </Menu.Item>
            <Menu.Item leftSection={<IconDeviceTv size={14} />} onClick={enableKiosk}>
              Режим киоска
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Group>
  );
}
