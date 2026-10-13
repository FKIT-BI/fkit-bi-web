// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { setupPageTests } from '@/shared/mocks/testing';
import { router as appRouter } from './router';

setupPageTests();
afterEach(cleanup);

async function renderApp(path: string) {
  const router = createRouter({ routeTree: appRouter.routeTree, history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  render(
    <MantineProvider>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>,
  );
  return router;
}

describe('каркас приложения', () => {
  it('общая навигация везде, дерево машин — только в мониторинге', async () => {
    const user = userEvent.setup();
    const router = await renderApp('/');

    const nav = await screen.findByRole('navigation', { name: 'Разделы' });
    expect(nav.textContent).toMatch(/Портал.*Мониторинг.*Инциденты.*Генерация.*Администрирование/);
    expect(screen.getByRole('link', { name: 'Портал' }).getAttribute('aria-current')).toBe('page');
    expect(await screen.findByText('Предприятия')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Поиск машины')).toBeNull();

    await user.click(screen.getByRole('link', { name: 'Администрирование' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'));
    expect(await screen.findByRole('tab', { name: 'Настройка' })).toBeTruthy();
    expect(screen.queryByPlaceholderText('Поиск машины')).toBeNull();

    await user.click(screen.getByRole('link', { name: 'Инциденты' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/incidents'));
    expect(await screen.findByPlaceholderText('Поиск машины')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Инциденты' }).getAttribute('aria-current')).toBe('page');

    await user.click(screen.getByRole('link', { name: 'Генерация' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/generator'));
    expect(await screen.findByRole('button', { name: /Быстрая генерация/ })).toBeTruthy();
    expect(screen.queryByPlaceholderText('Поиск машины')).toBeNull();
  });

  it('переключатель предприятия виден в шапке', async () => {
    await renderApp('/');
    expect(await screen.findByRole('textbox', { name: 'Предприятие' }, { timeout: 3000 }).catch(() => screen.findByDisplayValue('Завод полимерной упаковки'))).toBeTruthy();
  });

  it('старый /portal ведёт на портал', async () => {
    const router = await renderApp('/portal');
    expect(router.state.location.pathname).toBe('/');
  });
});
