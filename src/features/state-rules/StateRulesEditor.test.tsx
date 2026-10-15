// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { MachineStateConfigurationInput } from '@/shared/api';
import type { RuleSignal } from './model';
import { initialConfig, StateRulesEditor } from './StateRulesEditor';

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  if (!('fonts' in document)) Object.defineProperty(document, 'fonts', { value: { addEventListener() {}, removeEventListener() {}, ready: Promise.resolve() } });
});
afterEach(cleanup);

const signals: RuleSignal[] = [
  { id: 'run', name: 'Машина в работе', valueType: 'BOOLEAN', signalKind: 'STATE', semanticCode: 'OPERATING_FLAG', unitCode: null, validMax: null, status: 'ACTIVE' },
  { id: 'speed', name: 'Скорость', valueType: 'DOUBLE', signalKind: 'GAUGE', semanticCode: 'LINEAR_SPEED', unitCode: null, validMax: 100, status: 'ACTIVE' },
];

let last: MachineStateConfigurationInput | null = null;
function Harness() {
  const [cfg, setCfg] = useState(() => initialConfig(signals));
  last = cfg;
  return <StateRulesEditor signals={signals} value={cfg} onChange={setCfg} />;
}

describe('редактор правил', () => {
  it('вопросы меняют правила, «Подробно» позволяет добавить условие', async () => {
    const user = userEvent.setup();
    render(<MantineProvider><Harness /></MantineProvider>);
    expect(screen.getByText('Работа — если «Машина в работе» = да дольше 10 с')).toBeTruthy();

    // работа по порогу скорости
    await user.click(screen.getByRole('radio', { name: /больше порога/ }));
    expect(last?.rules[0].enterCondition).toMatchObject({ signalId: 'speed', operator: 'GT' });

    // подробно: второе условие «любое из» и смена оператора
    await user.click(screen.getByText('Подробно'));
    const card = screen.getByLabelText('Название').closest('.mantine-Card-root') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Ещё условие' }));
    expect(last?.rules[0].enterCondition).toMatchObject({ type: 'ALL', conditions: [{ signalId: 'speed' }, { signalId: 'run' }] });
    await user.click(within(card).getByText('любое из условий'));
    expect(last?.rules[0].enterCondition.type).toBe('ANY');
    fireEvent.change(within(card).getAllByLabelText('Оператор')[0], { target: { value: 'EQ' } });
    expect((last?.rules[0].enterCondition as { conditions: Array<Record<string, unknown>> }).conditions[0]).toMatchObject({ operator: 'EQ', tolerance: 0.01 });
    expect(screen.getByText(/«Скорость» равно 0 \(±0.01\) или «Машина в работе» = да/)).toBeTruthy();

    // JSON для экспертов показывает те же правила
    await user.click(screen.getByText('JSON для экспертов'));
    expect((screen.getByLabelText(/Правила \(JSON\)/) as HTMLTextAreaElement).value).toContain('"type": "ANY"');
  });
});
