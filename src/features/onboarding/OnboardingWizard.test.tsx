// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setup } from '@/shared/api';
import { ENTERPRISE_ID } from '@/shared/mocks/fixtures';
import { renderPage, setupPageTests } from '@/shared/mocks/testing';
import { useAdminNav } from '@/shared/model';
import { DRAFT_KEY } from './draft';
import { OnboardingWizard } from './OnboardingWizard';

setupPageTests();
beforeEach(() => {
  sessionStorage.clear();
  useAdminNav.setState({ tab: 'wizard', resumeId: null });
});
afterEach(cleanup);

const next = () => userEvent.click(screen.getByRole('button', { name: 'Сохранить и далее' }));
// Сквозные сценарии проходят все шаги мастера — на медленном CI им нужно больше стандартных 5 с.
const E2E_TIMEOUT = 30_000;
const heading = (name: string) => screen.findByRole('heading', { name }, { timeout: 3000 });

describe('мастер подключения машины', () => {
  it('проводит от предприятия до подключённой машины, сохраняя каждый шаг', async () => {
    const user = userEvent.setup();
    await renderPage(<OnboardingWizard />);

    // 1. Предприятие: выбираем существующее
    await user.click(await screen.findByRole('radio', { name: 'Завод полимерной упаковки' }));
    await next();

    // 2. Смены и причины уже есть у предприятия — шаг подтверждает их
    await heading('2. Смены и причины потерь');
    expect(await screen.findByText(/Смены уже настроены/)).toBeTruthy();
    await next();

    // 3. Линия: пустое название не сохраняется
    await heading('3. Линия');
    await user.click(screen.getByRole('radio', { name: 'Новая линия' }));
    await next();
    expect(await screen.findByText('Введите название линии.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Название линии/), { target: { value: 'Линия теста' } });
    await next();

    // 4. Машина: тип подсказывает набор сигналов
    await heading('4. Машина');
    fireEvent.change(screen.getByLabelText(/^Название/), { target: { value: 'Экструдер Тест' } });
    fireEvent.change(screen.getAllByLabelText(/^Тип машины/)[0], { target: { value: 'Экструдер' } });
    await next();
    await heading('5. Сигналы');
    const machine = (await setup.machines(ENTERPRISE_ID)).find((m) => m.name === 'Экструдер Тест');
    expect(machine).toMatchObject({ code: 'EKSTRUDER_TEST', status: 'DISABLED' });

    // 5. Сигналы: «Добавить все» по типу машины
    await user.click(await screen.findByRole('button', { name: 'Добавить все' }));
    expect(screen.getAllByLabelText('Название сигнала')).toHaveLength(5);
    await next();
    await heading('6. Как определять состояние');
    const signals = await setup.allSignals(machine!.id);
    expect(signals.map((s) => s.semanticCode).sort()).toEqual(['ALARM_FLAG', 'LINEAR_SPEED', 'OPERATING_FLAG', 'PRODUCTION_COUNT', 'TEMPERATURE']);
    expect(signals.every((s) => s.staleAfterMs === 60_000)).toBe(true);

    // 6. Состояние: правила предложены по сигналам и описаны текстом
    expect(await screen.findByText('Работа — если «Машина в работе» = да дольше 10 с')).toBeTruthy();
    expect(screen.getByText('Авария — если «Авария» = да дольше 5 с')).toBeTruthy();
    await next();

    // 7. Запуск
    await heading('7. Проверка и запуск');
    expect(await screen.findByText('Всё готово к подключению')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Подключить машину' }));
    expect(await screen.findByText('Машина «Экструдер Тест» подключена')).toBeTruthy();
    expect((await setup.machine(machine!.id)).status).toBe('ACTIVE');

    // следующая машина: предприятие и линия сохраняются, можно скопировать набор
    await user.click(screen.getByRole('button', { name: /Подключить ещё машину/ }));
    await heading('4. Машина');
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}')).toMatchObject({ step: 3, copyFromMachineId: machine!.id, machineId: '' });
  }, E2E_TIMEOUT);

  it('копирует сигналы и правила с машины-образца', async () => {
    const user = userEvent.setup();
    const source = (await setup.machines(ENTERPRISE_ID)).find((m) => m.status === 'ACTIVE')!;
    const created = await setup.createMachine(ENTERPRISE_ID, { code: 'COPY_TARGET', name: 'Копия', parameters: [] });
    useAdminNav.setState({ resumeId: created.id });
    await renderPage(<OnboardingWizard />);
    await heading('5. Сигналы');

    const select = (await screen.findAllByLabelText(/^Скопировать набор/))[0];
    await user.click(select);
    await user.click(await screen.findByRole('option', { name: source.name, hidden: true }));
    await user.click(screen.getByRole('button', { name: 'Скопировать' }));
    const sourceSignals = (await setup.allSignals(source.id)).filter((s) => s.status === 'ACTIVE');
    await waitFor(() => expect(screen.getAllByLabelText('Название сигнала')).toHaveLength(sourceSignals.length));
    await next();

    await heading('6. Как определять состояние');
    expect(await screen.findByText(/Правила перенесены с машины-образца/)).toBeTruthy();
    const copied = await setup.allSignals(created.id);
    expect(copied.map((s) => s.name).sort()).toEqual(sourceSignals.map((s) => s.name).sort());
    const list = within(screen.getByText('Как будет определяться состояние').parentElement!);
    expect(list.getAllByRole('listitem').length).toBeGreaterThan(2);
  }, E2E_TIMEOUT);
});
