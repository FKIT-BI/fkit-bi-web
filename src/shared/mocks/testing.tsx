import './storage-stub';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { beforeAll, afterAll, afterEach } from 'vitest';
import { useAuth, useUiStore } from '../model';
import { MOCK_CONFIG } from './config';
import { handlers } from './handlers';

/** Окружение для smoke-тестов страниц: jsdom-заглушки браузера + MSW (node) с теми же моками, что и в dev. */
export function setupPageTests() {
  const server = setupServer(...handlers);
  beforeAll(() => {
    MOCK_CONFIG.latencyMs = [0, 0];
    server.listen({ onUnhandledRequest: 'error' });
    window.matchMedia ??= ((query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia;
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    window.HTMLElement.prototype.scrollIntoView ??= () => {};
    if (!('fonts' in document)) Object.defineProperty(document, 'fonts', { value: { addEventListener() {}, removeEventListener() {}, ready: Promise.resolve() } });
    useAuth.getState().signIn(MOCK_CONFIG.token, { id: 'u', username: 'admin', displayName: 'Админ', canCreateUsers: false }, 1800);
    useUiStore.setState({ role: 'admin' });
  });
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}

export async function renderPage(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree: createRootRoute({ component: () => ui }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await router.load();
  return render(
    <MantineProvider>
      <Notifications />
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>,
  );
}
