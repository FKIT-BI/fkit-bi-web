import { createRootRoute, createRoute, createRouter, lazyRouteComponent, retainSearchParams } from '@tanstack/react-router';
import { DASHBOARD_SEARCH_KEYS, dashboardSearchSchema } from '@/shared/config';
import { Layout } from './Layout';

const rootRoute = createRootRoute({
  component: Layout,
  validateSearch: dashboardSearchSchema,
  search: { middlewares: [retainSearchParams([...DASHBOARD_SEARCH_KEYS])] },
});

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: lazyRouteComponent(() => import('@/pages/enterprise-overview')),
});

const machineRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/machines/$machineId',
  component: lazyRouteComponent(() => import('@/pages/machine-dashboard')),
});

const incidentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/incidents',
  component: lazyRouteComponent(() => import('@/pages/incidents')),
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: lazyRouteComponent(() => import('@/pages/admin')),
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([overviewRoute, machineRoute, incidentsRoute, adminRoute]),
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
