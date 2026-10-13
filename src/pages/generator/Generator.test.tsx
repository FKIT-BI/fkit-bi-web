// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderPage, setupPageTests } from '@/shared/mocks/testing';
import { useGeneratorNav } from '@/shared/model';
import { copyCode } from './CopyScenarioModal';
import GeneratorPage from './index';

setupPageTests();
beforeEach(() => useGeneratorNav.setState({ tab: 'scenarios', focusRun: null }));
afterEach(cleanup);

describe('страница генерации', () => {
  it('показывает сценарии, открывает редактор и запускает генерацию', async () => {
    const user = userEvent.setup();
    await renderPage(<GeneratorPage />);

    expect(await screen.findByText('Экструзия: норма и перегрев')).toBeTruthy();

    // редактор существующего сценария подтягивает фазы
    await user.click(screen.getAllByLabelText('Редактировать')[0]);
    expect(await screen.findByText('Фазы (2)')).toBeTruthy();
    expect(await screen.findByDisplayValue('Нормальная работа')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(await screen.findByText('Замечаний нет')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    // запуск из строки сценария
    await user.click(screen.getAllByLabelText('Запустить')[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Новый запуск генерации' });
    await user.click(within(dialog).getByRole('button', { name: 'Проверить' }));
    expect(await within(dialog).findByText('Проверка пройдена')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Запустить' }));

    // после создания открывается вкладка запусков с карточкой запуска
    expect(await screen.findByText('Запуск генерации')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('Выполняется').length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole('button', { name: 'Остановить' })[0]);
    await waitFor(() => expect(screen.getAllByText(/Останавливается|Остановлен/).length).toBeGreaterThan(0));
  }, 15_000); // full editor + run flow; ~2.4s locally, CI runners are ~2.5x slower

  it('создаёт сценарий и сообщает об ошибках валидации сервера', async () => {
    const user = userEvent.setup();
    await renderPage(<GeneratorPage />);
    await screen.findByText('Экструзия: норма и перегрев');
    await user.click(screen.getByRole('button', { name: /Новый сценарий/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Новый сценарий' });
    fireEvent.change(within(dialog).getAllByLabelText(/^Код/)[0], { target: { value: 'UI_TEST' } });
    fireEvent.change(within(dialog).getAllByLabelText(/^Название/)[0], { target: { value: 'Сценарий из теста' } });
    await user.click(within(dialog).getByRole('button', { name: 'Создать' }));
    // без машин сервер отвечает 422 — ошибка показана в форме
    expect(await within(dialog).findByText(/Выберите хотя бы одну машину|Request body is invalid/)).toBeTruthy();
  });

  it('копирует сценарий отключённым и открывает копию в редакторе', async () => {
    const user = userEvent.setup();
    await renderPage(<GeneratorPage />);
    await screen.findByText('Экструзия: норма и перегрев');
    await user.click(screen.getAllByLabelText('Копировать')[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Копирование сценария' });
    const code = within(dialog).getByLabelText(/^Код/) as HTMLInputElement;
    expect(code.value).toMatch(/_COPY$/);

    // занятый код — ошибка у поля, копия не создаётся
    const taken = code.value.replace(/_COPY$/, '');
    fireEvent.change(code, { target: { value: taken } });
    await user.click(within(dialog).getByRole('button', { name: 'Создать копию' }));
    expect(await within(dialog).findByText('Сценарий с таким кодом уже есть')).toBeTruthy();

    fireEvent.change(code, { target: { value: `${taken}_COPY` } });
    await user.click(within(dialog).getByRole('button', { name: 'Создать копию' }));
    expect(await screen.findByRole('dialog', { name: 'Редактирование сценария' })).toBeTruthy();
    expect(await screen.findByText('Фазы (2)')).toBeTruthy();
  });

  it('предлагает код копии в пределах 64 символов', () => {
    expect(copyCode('LINE_A')).toBe('LINE_A_COPY');
    expect(copyCode('LINE_A', 2)).toBe('LINE_A_COPY_2');
    expect(copyCode('A'.repeat(64))).toHaveLength(64);
  });

  it('быстрая генерация: собирает сценарий, активирует и запускает историю', async () => {
    const user = userEvent.setup();
    await renderPage(<GeneratorPage />);
    await screen.findByText('Экструзия: норма и перегрев');
    await user.click(screen.getByRole('button', { name: /Быстрая генерация/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Быстрая генерация данных' });
    await user.click(within(dialog).getByRole('button', { name: 'Далее' }));
    expect(await within(dialog).findByText(/12 машин/)).toBeTruthy();
    expect(within(dialog).getByText(/измерений/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Сгенерировать' }));
    expect(await screen.findByText('Запуск генерации')).toBeTruthy();
    expect(useGeneratorNav.getState().tab).toBe('runs');
  });
});
