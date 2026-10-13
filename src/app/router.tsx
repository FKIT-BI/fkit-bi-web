import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Outlet, redirect, retainSearchParams } from '@tanstack/react-router';
import { z } from 'zod';
import { DASHBOARD_SEARCH_KEYS, dashboardSearchSchema } from '@/shared/config';
import { isAuthenticated } from '@/shared/model';
import { Layout } from './Layout';

const rootRoute = createRootRoute({
  component: Outlet,
  validateSearch: dashboardSearchSchema,
  search: { middlewares: [retainSearchParams([...DASHBOARD_SEARCH_KEYS])] },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: z.object({ redirect: z.string().optional().catch(undefined) }),
  component: lazyRouteComponent(() => import('@/pages/login')),
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: Layout,
  beforeLoad: ({ location }) => {
    if (!isAuthenticated()) throw redirect({ to: '/login', search: { redirect: location.href } });
  },
});

const overviewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: lazyRouteComponent(() => import('@/pages/enterprise-overview')),
});

const machineRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/machines/$machineId',
  component: lazyRouteComponent(() => import('@/pages/machine-dashboard')),
});

const incidentsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/incidents',
  component: lazyRouteComponent(() => import('@/pages/incidents')),
});

const adminRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin',
  component: lazyRouteComponent(() => import('@/pages/admin')),
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([loginRoute, appRoute.addChildren([overviewRoute, machineRoute, incidentsRoute, adminRoute])]),
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
