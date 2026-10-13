// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ENTERPRISE_ID } from '@/shared/mocks/fixtures';
import { renderPage, setupPageTests } from '@/shared/mocks/testing';
import { useAdminNav, useEnterpriseChoice } from '@/shared/model';
import PortalPage from './index';

setupPageTests();
afterEach(cleanup);

describe('портал', () => {
  it('показывает предприятие с показателями и запоминает выбор', async () => {
    const user = userEvent.setup();
    await renderPage(<PortalPage />);
    const card = await screen.findByRole('button', { name: /Открыть Завод полимерной упаковки/ });
    await waitFor(() => expect(card.textContent).toMatch(/12\s*машин/));
    expect(card.textContent).toMatch(/3\s*линий/);
    expect(screen.getByText('Журнал инцидентов')).toBeTruthy();
    expect(screen.getByText('Добавить предприятие')).toBeTruthy();
    await user.click(card);
    expect(useEnterpriseChoice.getState().id).toBe(ENTERPRISE_ID);
  });

  it('создаёт предприятие прямо с портала и показывает ошибку дубликата кода', async () => {
    const user = userEvent.setup();
    await renderPage(<PortalPage />);
    await user.click(await screen.findByRole('button', { name: 'Добавить предприятие' }));
    const dialog = await screen.findByRole('dialog', { name: 'Новое предприятие' });
    const submit = within(dialog).getByRole('button', { name: 'Создать' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(within(dialog).getByLabelText(/^Название/), { target: { value: 'Завод №2' } });
    fireEvent.change(within(dialog).getByLabelText(/^Код/), { target: { value: 'flexo_01' } });
    await user.click(submit);
    expect(await within(dialog).findByText(/DUPLICATE_CODE/)).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText(/^Код/), { target: { value: 'PLANT_B' } });
    await user.click(submit);
    // после создания выбираем новое предприятие и ведём на пошаговую настройку
    await waitFor(() => expect(useAdminNav.getState().tab).toBe('setup'));
    expect(useEnterpriseChoice.getState().id).not.toBe(ENTERPRISE_ID);
  });
});
