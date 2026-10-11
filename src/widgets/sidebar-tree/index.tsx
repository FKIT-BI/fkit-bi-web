import { Group, NavLink, ScrollArea, Skeleton, Stack, Text, TextInput } from '@mantine/core';
import { IconAlertCircle, IconBuildingFactory2, IconLayoutDashboard, IconSearch, IconSettings } from '@tabler/icons-react';
import { Link, useParams, useRouterState } from '@tanstack/react-router';
import { useState } from 'react';
import { useEnterpriseTree } from '@/entities/enterprise';
import { StateDot, useCurrentStates } from '@/entities/machine';
import { useTranslation } from '@/shared/i18n';

export function SidebarTree() {
  const { t } = useTranslation();
  const tree = useEnterpriseTree();
  const states = useCurrentStates(tree.enterprise?.id);
  const [query, setQuery] = useState('');
  const params = useParams({ strict: false }) as { machineId?: string };
  const path = useRouterState({ select: (s) => s.location.pathname });
  const q = query.trim().toLowerCase();

  return (
    <Stack gap={0} h="100%">
      <TextInput
        m="sm"
        size="xs"
        placeholder={t('nav.search')}
        aria-label={t('nav.search')}
        leftSection={<IconSearch size={14} />}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
      />
      <ScrollArea style={{ flex: 1 }} px="xs">
        <NavLink
          component={Link}
          to="/"
          label={tree.enterprise?.name ?? t('nav.overview')}
          description={t('nav.overview')}
          leftSection={<IconBuildingFactory2 size={16} />}
          active={path === '/'}
        />
        {tree.isLoading && <Skeleton h={200} mt="xs" />}
        {tree.lines.map((line) => {
          const machines = line.machines.filter((m) => !q || m.name.toLowerCase().includes(q));
          if (q && !machines.length) return null;
          return (
            <NavLink
              key={line.id}
              label={line.name}
              leftSection={<IconLayoutDashboard size={16} />}
              defaultOpened
              opened={q ? true : undefined}
              childrenOffset={14}
            >
              {machines.map((m) => (
                <NavLink
                  key={m.id}
                  renderRoot={(props) => <Link {...props} to="/machines/$machineId" params={{ machineId: m.id }} />}
                  active={params.machineId === m.id}
                  label={
                    <Group gap={8} wrap="nowrap">
                      <StateDot state={states.byMachine.get(m.id)?.stateCode} />
                      <Text size="sm" truncate>
                        {m.name}
                      </Text>
                    </Group>
                  }
                />
              ))}
            </NavLink>
          );
        })}
        {q && tree.machines.every((m) => !m.name.toLowerCase().includes(q)) && (
          <Text size="sm" c="dimmed" p="sm">
            {t('nav.nothingFound')}
          </Text>
        )}
      </ScrollArea>
      <Stack gap={0} p="xs" style={{ borderTop: '1px solid var(--panel-border)' }}>
        <NavLink component={Link} to="/incidents" label={t('nav.incidents')} leftSection={<IconAlertCircle size={16} />} active={path === '/incidents'} />
        <NavLink component={Link} to="/admin" label={t('nav.admin')} leftSection={<IconSettings size={16} />} active={path === '/admin'} />
      </Stack>
    </Stack>
  );
}
