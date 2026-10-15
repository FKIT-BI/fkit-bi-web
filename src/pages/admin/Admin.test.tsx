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
    await user.click(await screen.findByRole('tab', { name: 'Предприятия' }));
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
    fireEvent.change(within(dialog).getByLabelText(/^Название/), { target: { value: 'Дубль' } });
    expect(within(dialog).getByText('DUBL')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Изменить код' }));
    fireEvent.change(within(dialog).getByLabelText(/^Код/), { target: { value: 'DAY' } });
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect((await within(dialog).findAllByText(/Смена с таким кодом уже есть/)).length).toBeGreaterThan(0);
    // возврат к автоматическому коду из нового названия
    fireEvent.change(within(dialog).getByLabelText(/^Название/), { target: { value: 'Вечерняя' } });
    await user.click(within(dialog).getByRole('button', { name: 'Вернуть автоматический' }));
    expect((within(dialog).getByLabelText(/^Код/) as HTMLInputElement).value).toBe('VECHERNYAYA');
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

  it('сигнал: подписи и списки на русском, выбор «что измеряет» подставляет формат и характер', async () => {
    const user = userEvent.setup();
    await renderPage(<AdminPage />);
    await user.click(await screen.findByRole('tab', { name: 'Линии и машины' }));
    await screen.findByText('Экструдер ЭК-1');
    await user.click(screen.getAllByLabelText('Детали машины')[0]);
    await user.click(await screen.findByRole('tab', { name: 'Сигналы' }));
    await screen.findByText('Скорость');
    // таблица сигналов: характер и формат подписаны по-русски
    expect(screen.queryByText(/^(GAUGE|COUNTER|STATE|DOUBLE|LONG|BOOLEAN)\b/)).toBeNull();
    await user.click(screen.getByRole('button', { name: /Новый сигнал/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Новый сигнал' });
    fireEvent.change(within(dialog).getByLabelText(/^Название/), { target: { value: 'Счётчик изделий' } });
    expect(within(dialog).getByText('SCHYOTCHIK_IZDELIJ')).toBeTruthy();
    await user.click(within(dialog).getByLabelText(/^Что измеряет/));
    await user.click(await screen.findByRole('option', { name: /Выпуск продукции/, hidden: true }));
    expect((within(dialog).getByLabelText(/^Формат значения/) as HTMLInputElement).value).toBe('Целое число');
    expect((within(dialog).getByLabelText(/^Характер сигнала/) as HTMLInputElement).value).toBe('Накопительный счётчик');
    // «Считать устаревшим через» по умолчанию 1 минута — сигнал сразу пригоден для правил
    expect((within(dialog).getByLabelText(/Считать устаревшим через/) as HTMLInputElement).value).toBe('1');
    expect(dialog.textContent).not.toMatch(/\b(GAUGE|COUNTER|DOUBLE|LONG|BOOLEAN|PRODUCTION_COUNT|TEMPERATURE)\b/);
  });

  it('машина: единица выбирается из справочника, а неполная пара норма/единица не отправляется', async () => {
    const user = userEvent.setup();
    await renderPage(<AdminPage />);
    await user.click(await screen.findByRole('tab', { name: 'Линии и машины' }));
    await screen.findByText('Экструдер ЭК-1');
    await user.click(screen.getByRole('button', { name: /Новая машина/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Новая машина' });
    fireEvent.change(within(dialog).getByLabelText(/^Название/), { target: { value: 'Новая машина' } });
    expect(within(dialog).getByText('NOVAYA_MASHINA')).toBeTruthy();
    const unit = within(dialog).getByLabelText('Единица выпуска') as HTMLSelectElement;
    await waitFor(() => expect(within(unit).getByRole('option', { name: 'Штука (шт)' })).toBeTruthy());
    fireEvent.change(within(dialog).getByLabelText('Норма выпуска в час'), { target: { value: '100' } });
    expect(await within(dialog).findByText('Выберите единицу выпуска')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(unit, { target: { value: 'PCS' } });
    await waitFor(() => expect((within(dialog).getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(false));
  });
});
