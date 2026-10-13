// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MACHINES } from '@/shared/mocks/fixtures';
import { renderPage, setupPageTests } from '@/shared/mocks/testing';
import { IncidentModal } from './IncidentModal';
import { useIncidentModal } from './model';

setupPageTests();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useIncidentModal.getState().close();
});

const incidentListCalls = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.filter(([input]) => {
    const url = input instanceof Request ? input.url : String(input);
    return /\/machines\/[^/]+\/incidents\?/.test(url);
  }).length;

describe('регистрация инцидента', () => {
  it('для продолжающегося инцидента не перезапрашивает пересечения в цикле', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await renderPage(<IncidentModal />);
    act(() => useIncidentModal.getState().open({ machineId: MACHINES[0].id, from: Date.now() - 10 * 60_000, to: null }));
    await screen.findByRole('dialog');
    await waitFor(() => expect(incidentListCalls(fetchSpy)).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 600));
    // HAR 2026-10-13: Date.now() in the query key produced ~45 requests per second.
    expect(incidentListCalls(fetchSpy)).toBeLessThanOrEqual(2);
  });
});
