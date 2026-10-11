import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './main';
import { tokenKey } from './api/client';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('configuration setup recovery', () => {
  it('returns to login after an expired session and preserves the setup draft', async () => {
    sessionStorage.setItem(tokenKey, 'expired-token');
    sessionStorage.setItem('fkit-bi-setup-draft', JSON.stringify({ enterpriseName: 'Завод', enterpriseCode: 'PLANT_A' }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'AUTHENTICATION_FAILED', message: 'Expired', traceId: 'trace-1', fieldErrors: [], details: {} }), { status: 401, headers: { 'Content-Type': 'application/json' } })));

    render(<App />);

    expect(await screen.findByText(/Сессия истекла/)).toBeTruthy();
    expect(sessionStorage.getItem(tokenKey)).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('fkit-bi-setup-draft') ?? '{}')).toMatchObject({ enterpriseName: 'Завод', enterpriseCode: 'PLANT_A' });
    expect(screen.getByLabelText('Имя пользователя')).toBeTruthy();
  });

  it('shows a field error without clearing the corrected form input', async () => {
    sessionStorage.setItem(tokenKey, 'valid-token');
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push(url);
      if (url.includes('/enterprises?')) return Response.json({ items: [{ id: 'enterprise-1', code: 'PLANT_A', name: 'Завод', timezone: 'Europe/Moscow', status: 'ACTIVE' }] });
      if (url.includes('/enterprises/enterprise-1/lines')) {
        if (init?.method === 'POST') return new Response(JSON.stringify({ code: 'VALIDATION_FAILED', message: 'Invalid line', traceId: 'trace-2', fieldErrors: [{ path: 'code', code: 'INVALID_CODE', message: 'Неверный код' }], details: {} }), { status: 422, headers: { 'Content-Type': 'application/json' } });
        return Response.json({ items: [] });
      }
      if (url.includes('/enterprises/enterprise-1/machines')) return Response.json({ items: [] });
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(<App />);
    const lineSection = await screen.findByRole('heading', { name: 'Линии и машины' }).then(h => h.closest('#lines') as HTMLElement | null);
    if (!lineSection) throw new Error('Line setup section was not rendered');
    const codeInput = within(lineSection).getAllByLabelText('Код')[0];
    await userEvent.type(codeInput, 'LINE_A');
    await userEvent.type(within(lineSection).getAllByLabelText('Название')[0], 'Участок A');
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem('fkit-bi-setup-draft') ?? '{}').lineCode).toBe('LINE_A'));
    fireEvent.click(within(lineSection).getByRole('button', { name: 'Добавить линию' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Неверный код');
    expect((codeInput as HTMLInputElement).value).toBe('LINE_A');
    expect(requests.some(url => url.includes('/enterprises/enterprise-1/lines'))).toBe(true);
  });

});
