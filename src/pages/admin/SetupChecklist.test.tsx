// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setup } from '@/shared/api';
import { ENTERPRISE_ID } from '@/shared/mocks/fixtures';
import { renderPage, setupPageTests } from '@/shared/mocks/testing';
import { useAdminNav } from '@/shared/model';
import AdminPage from './index';

setupPageTests();
beforeEach(() => {
  sessionStorage.clear();
  useAdminNav.setState({ tab: 'setup', machineId: null, resumeId: null });
});
afterEach(cleanup);

describe('пошаговая настройка', () => {
  it('ведёт к недостающим сигналам и правилам новой машины', async () => {
    const user = userEvent.setup();
    await setup.createMachine(ENTERPRISE_ID, { code: 'NEW_PRESS', name: 'Новый пресс', parameters: [] });
    await renderPage(<AdminPage />);

    expect(await screen.findByText('1. Смены')).toBeTruthy();
    const row = (await screen.findByText('Новый пресс')).closest('div')!.parentElement!;
    expect(await within(row).findByText('У машины нет активных сигналов')).toBeTruthy();
    expect(within(row).getByText('Не заданы правила состояния')).toBeTruthy();

    // продолжение настройки открывает мастер на первом незавершённом шаге — «Сигналы»
    await user.click(within(row).getByRole('button', { name: 'Продолжить настройку' }));
    expect(await screen.findByRole('heading', { name: '5. Сигналы' })).toBeTruthy();
    expect(useAdminNav.getState().tab).toBe('wizard');
    await waitFor(() => expect(useAdminNav.getState().resumeId).toBeNull());
  });
});
