import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import './styles.css';
import '@/shared/i18n';

import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { DashboardRegistryProvider } from '@/shared/ui';
import { dashboardRegistry } from './dashboard-registry';
import { router } from './router';
import { theme } from './theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
  },
});

export function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <DatesProvider settings={{ locale: 'ru', firstDayOfWeek: 1 }}>
        <Notifications position="top-right" />
        <QueryClientProvider client={queryClient}>
          <DashboardRegistryProvider value={dashboardRegistry}>
            <RouterProvider router={router} />
          </DashboardRegistryProvider>
        </QueryClientProvider>
      </DatesProvider>
    </MantineProvider>
  );
}
