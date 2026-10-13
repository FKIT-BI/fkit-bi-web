// @vitest-environment jsdom
import './storage-stub';
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

const fresh = async () => {
  const persist = await import('./persist');
  const { db } = await import('./db');
  const gen = await import('./handlers/generator');
  void gen;
  return { persist, db };
};

describe('сохранение мок-данных в localStorage', () => {
  it('предприятия, машины, сигналы и инциденты переживают «перезагрузку»', async () => {
    const a = await fresh();
    a.persist.loadPersisted();
    const before = a.db.enterprises.length;
    a.db.enterprises.push({ ...a.db.enterprises[0], id: 'ent-new', code: 'NEW', name: 'Новый завод' });
    a.db.components.set(a.db.machines[0].id, [{ id: 'c1', machineId: a.db.machines[0].id, code: 'C1', name: 'Мотор' } as never]);
    a.db.signalPatches.set('sig-1', { name: 'Переименован' });
    a.db.incidents.push({ id: 'i1', machineId: a.db.machines[0].id, from: 1, to: null, stateOverride: 'SETUP', lossReasonId: null, comment: 'x', author: null, createdAt: 1, updatedAt: 1, cancelledAt: null });
    a.persist.savePersisted();

    vi.resetModules();
    const b = await fresh();
    expect(b.db.enterprises).toHaveLength(before); // до восстановления — исходные данные
    b.persist.loadPersisted();
    expect(b.db.enterprises.map((e) => e.name)).toContain('Новый завод');
    expect(b.db.components.get(b.db.machines[0].id)?.[0].name).toBe('Мотор');
    expect(b.db.signalPatches.get('sig-1')).toEqual({ name: 'Переименован' });
    expect(b.db.incidents.map((i) => i.id)).toEqual(['i1']);
  });

  it('сценарии и запуски генератора сохраняются, повреждённое хранилище игнорируется', async () => {
    const a = await fresh();
    a.persist.loadPersisted();
    a.persist.savePersisted();
    const saved = JSON.parse(localStorage.getItem(a.persist.PERSIST_KEY)!);
    expect(saved.state.generator.scenarios.length).toBeGreaterThan(0);
    expect(saved.state.core.machines.length).toBe(12);

    localStorage.setItem(a.persist.PERSIST_KEY, '{not json');
    vi.resetModules();
    const b = await fresh();
    b.persist.loadPersisted();
    expect(b.db.enterprises.length).toBeGreaterThan(0);
  });

  it('запись через мок-API сохраняет состояние, чтение — нет', async () => {
    const { setupServer } = await import('msw/node');
    const { handlers } = await import('./handlers');
    const { MOCK_CONFIG } = await import('./config');
    const persist = await import('./persist');
    MOCK_CONFIG.latencyMs = [0, 0];
    const server = setupServer(...handlers);
    server.listen({ onUnhandledRequest: 'error' });
    const auth = { Authorization: `Bearer ${MOCK_CONFIG.token}`, 'Content-Type': 'application/json' };
    await fetch('http://localhost/api/analytics/api/v1/enterprises', { headers: auth });
    expect(localStorage.getItem(persist.PERSIST_KEY)).toBeNull();
    const res = await fetch('http://localhost/api/analytics/api/v1/enterprises', { method: 'POST', headers: auth, body: JSON.stringify({ code: 'PERSISTED', name: 'Сохранённый', timezone: 'Europe/Moscow' }) });
    expect(res.status).toBe(201);
    expect(localStorage.getItem(persist.PERSIST_KEY)).toContain('Сохранённый');
    server.close();
  });
});
