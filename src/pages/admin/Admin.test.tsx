// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { renderPage, setupPageTests } from '@/shared/mocks/testing';
import AdminPage from './index';

setupPageTests();
afterEach(cleanup);

describe('администрирование', () => {
  it('предприятия: список и редактирование названия', async () => {
    const user = userEvent.setup();
    await renderPage(<AdminPage />);
    expect(await screen.findByText('Завод полимерной упаковки')).toBeTruthy();
    await user.click(screen.getByLabelText('Редактировать'));
    const dialog = await screen.findByRole('dialog', { name: 'Предприятие' });
    const name = within(dialog).getByLabelText(/^Название/);
    fireEvent.change(name, { target: { value: 'Завод №1' } });
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Завод №1')).toBeTruthy();
  });

  it('смены: создание новой смены и показ ошибки дубликата', async () => {
    const user = userEvent.setup();
    await renderPage(<AdminPage />);
    await screen.findByText('Завод №1', {}, { timeout: 3000 }).catch(() => screen.findByText('Завод полимерной упаковки'));
    await user.click(screen.getByRole('tab', { name: 'Смены' }));
    expect(await screen.findByText('Ночь')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Новая смена/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Новая смена' });
    fireEvent.change(within(dialog).getByLabelText(/^Код/), { target: { value: 'DAY' } });
    fireEvent.change(within(dialog).getByLabelText(/^Название/), { target: { value: 'Дубль' } });
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect((await within(dialog).findAllByText(/Смена с таким кодом уже есть/)).length).toBeGreaterThan(0);
    fireEvent.change(within(dialog).getByLabelText(/^Код/), { target: { value: 'EVENING' } });
    fireEvent.change(within(dialog).getByLabelText(/^Название/), { target: { value: 'Вечерняя' } });
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Новая смена' })).toBeNull());
    expect(await screen.findByText('Вечерняя')).toBeTruthy();
  });

  it('линии и машины: детали машины с готовностью к активации', async () => {
    const user = userEvent.setup();
    await renderPage(<AdminPage />);
    await user.click(await screen.findByRole('tab', { name: 'Линии и машины' }));
    expect(await screen.findByText('Экструдер ЭК-1')).toBeTruthy();
    await user.click(screen.getAllByLabelText('Детали машины')[0]);
    expect(await screen.findByText(/Готова к активации|Не готова к активации/)).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'Сигналы' }));
    expect(await screen.findByText('Скорость')).toBeTruthy();
  });

  it('машина: единица выбирается из справочника, а неполная пара норма/единица не отправляется', async () => {
    const user = userEvent.setup();
    await renderPage(<AdminPage />);
    await user.click(await screen.findByRole('tab', { name: 'Линии и машины' }));
    await screen.findByText('Экструдер ЭК-1');
    await user.click(screen.getByRole('button', { name: /Новая машина/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Новая машина' });
    fireEvent.change(within(dialog).getByLabelText(/^Код/), { target: { value: 'NEW' } });
    fireEvent.change(within(dialog).getByLabelText(/^Название/), { target: { value: 'NEW' } });
    const unit = within(dialog).getByLabelText('Единица выпуска') as HTMLSelectElement;
    await waitFor(() => expect(within(unit).getByRole('option', { name: 'Штука (шт)' })).toBeTruthy());
    fireEvent.change(within(dialog).getByLabelText('Норма выпуска в час'), { target: { value: '100' } });
    expect(await within(dialog).findByText('Выберите единицу выпуска')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(unit, { target: { value: 'PCS' } });
    await waitFor(() => expect((within(dialog).getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(false));
  });
});
