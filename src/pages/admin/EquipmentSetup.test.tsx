// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/shared/model';
import { DRAFT_KEY, EquipmentSetup } from './EquipmentSetup';

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  useAuth.getState().signOut();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function renderSetup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider>
      <QueryClientProvider client={qc}>
        <EquipmentSetup />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('настройка оборудования', () => {
  it('после истечения сессии выходит из системы и сохраняет черновик', async () => {
    useAuth.getState().signIn('expired-token', { id: 'u', username: 'op', displayName: 'Оператор', canCreateUsers: false }, 1800);
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ enterpriseName: 'Завод', enterpriseCode: 'PLANT_A' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ code: 'AUTHENTICATION_FAILED', message: 'Expired', traceId: 'trace-1', fieldErrors: [], details: {} }, 401)),
    );

    renderSetup();

    await waitFor(() => expect(useAuth.getState().token).toBeNull());
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}')).toMatchObject({ enterpriseName: 'Завод', enterpriseCode: 'PLANT_A' });
  });

  it('показывает ошибку поля и не очищает введённое значение', async () => {
    useAuth.getState().signIn('valid-token', { id: 'u', username: 'op', displayName: 'Оператор', canCreateUsers: false }, 1800);
    const requests: Array<{ url: string; method: string; auth: string | null }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(String(input), init);
        const url = req.url;
        requests.push({ url, method: req.method, auth: req.headers.get('Authorization') });
        if (url.includes('/reference/measurement-units')) return json([{ code: 'PCS', name: 'Штука', symbol: 'шт', quantityCode: 'COUNT' }]);
        if (/\/enterprises\?/.test(url)) {
          return json({ items: [{ id: 'enterprise-1', code: 'PLANT_A', name: 'Завод', timezone: 'Europe/Moscow', status: 'ACTIVE' }], page: { number: 0, size: 200, totalElements: 1, totalPages: 1 } });
        }
        if (url.includes('/enterprises/enterprise-1/lines')) {
          if (req.method === 'POST') {
            return json({ code: 'VALIDATION_FAILED', message: 'Invalid line', traceId: 'trace-2', fieldErrors: [{ path: 'code', code: 'INVALID_CODE', message: 'Неверный код' }], details: {} }, 422);
          }
          return json({ items: [], page: { number: 0, size: 200, totalElements: 0, totalPages: 0 } });
        }
        if (url.includes('/enterprises/enterprise-1/machines')) return json({ items: [], page: { number: 0, size: 200, totalElements: 0, totalPages: 0 } });
        throw new Error(`Unexpected request: ${req.method} ${url}`);
      }),
    );

    renderSetup();
    const lineSection = (await screen.findByRole('heading', { name: 'Линии и машины' })).closest('#lines') as HTMLElement;
    const codeInput = (await within(lineSection).findAllByLabelText(/^Код/))[0] as HTMLInputElement;
    await userEvent.type(codeInput, 'line_a');
    await userEvent.type(within(lineSection).getAllByLabelText(/^Название/)[0], 'Участок A');
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}').lineCode).toBe('LINE_A'));
    fireEvent.click(within(lineSection).getByRole('button', { name: 'Добавить линию' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Неверный код');
    expect(codeInput.value).toBe('LINE_A');
    const post = requests.find((r) => r.method === 'POST');
    expect(post?.url).toContain('/api/analytics/api/v1/enterprises/enterprise-1/lines');
    expect(post?.auth).toBe('Bearer valid-token');
  });
});
