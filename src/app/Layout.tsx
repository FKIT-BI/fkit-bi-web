import { AppShell, Center, Loader, Text } from '@mantine/core';
import { useDisclosure, useHotkeys } from '@mantine/hooks';
import { Outlet, useRouterState } from '@tanstack/react-router';
import { useState } from 'react';
import { useEnterpriseTree } from '@/entities/enterprise';
import { useAutoRefresh } from '@/features/auto-refresh';
import { IncidentModal } from '@/features/register-incident';
import { setAppTimezone } from '@/shared/lib';
import { useDashboardSearch, useUiStore } from '@/shared/model';
import { AppHeader } from '@/widgets/app-header';
import { DashboardToolbar } from '@/widgets/dashboard-toolbar';
import { SidebarTree } from '@/widgets/sidebar-tree';

const chrome = { background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' };

export function Layout() {
  const tree = useEnterpriseTree();
  const [search, update] = useDashboardSearch();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const [mobileOpened, mobile] = useDisclosure(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const kiosk = !!search.kiosk;
  useAutoRefresh();
  useHotkeys([['Escape', () => kiosk && update({ kiosk: undefined })]]);
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) {
    setLastPath(path);
    mobile.close();
  }

  if (!tree.enterprise) {
    return (
      <Center h="100vh">
        {tree.isError ? <Text c="red">Не удалось загрузить предприятие</Text> : <Loader />}
      </Center>
    );
  }
  setAppTimezone(tree.enterprise.timezone);

  return (
    <AppShell
      header={{ height: 48, collapsed: kiosk }}
      navbar={{
        width: { base: 300, md: 260 },
        breakpoint: 'md',
        collapsed: { mobile: kiosk || !mobileOpened, desktop: kiosk || collapsed },
      }}
      padding={{ base: 6, sm: 8 }}
    >
      <AppShell.Header style={chrome}>
        <AppHeader mobileOpened={mobileOpened} onToggleMobile={mobile.toggle} />
      </AppShell.Header>
      <AppShell.Navbar style={chrome}>
        <SidebarTree />
      </AppShell.Navbar>
      <AppShell.Main>
        {!kiosk && <DashboardToolbar />}
        <Outlet />
      </AppShell.Main>
      <IncidentModal />
    </AppShell>
  );
}
