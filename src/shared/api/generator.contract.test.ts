import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { MOCK_CONFIG } from '../mocks/config';
import { handlers } from '../mocks/handlers';
import { ENTERPRISE_ID } from '../mocks/fixtures';

const spec = parse(readFileSync('openapi/generator-api.yaml', 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(spec, 'generator');
const validate = (schema: string, data: unknown) => {
  const fn = ajv.getSchema(`generator#/components/schemas/${schema}`)!;
  return fn(data) ? [] : (fn.errors ?? []).map((e) => `${e.instancePath} ${e.message} ${JSON.stringify(e.params)}`);
};

const METHODS = ['get', 'post', 'put', 'delete'];
const normalize = (op: string) => op.replace(/[:{](\w+)}?/g, ':p');
const specOps = new Set(
  Object.entries(spec.paths as Record<string, Record<string, unknown>>).flatMap(([path, item]) =>
    METHODS.filter((m) => m in item).map((m) => normalize(`${m.toUpperCase()} ${path}`)),
  ),
);
const mockOps = handlers
  .filter((h) => String(h.info.path).includes('/api/generator/'))
  .map((h) => normalize(`${h.info.method} ${String(h.info.path).replace(/^\*\/api\/generator\/api\/v1/, '')}`));

const server = setupServer(...handlers);
const BASE = 'http://localhost/api/generator/api/v1';
const AUTH = { Authorization: `Bearer ${MOCK_CONFIG.token}` };

beforeAll(() => {
  MOCK_CONFIG.latencyMs = [0, 0];
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => server.close());

async function call(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const res = await fetch(BASE + path, {
    method: init.method ?? 'GET',
    headers: { ...AUTH, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}

describe('generator: моки ⊂ generator-api.yaml', () => {
  it('каждый маршрут мока есть в спеке и наоборот', () => {
    expect(mockOps.filter((op) => !specOps.has(op))).toEqual([]);
    expect([...specOps].filter((op) => !mockOps.includes(op))).toEqual([]);
  });
});

describe('generator: ответы валидны по схемам', () => {
  let scenarioId = '';
  const draft = (code: string, machineId: string) => ({
    enterpriseId: ENTERPRISE_ID,
    code,
    name: 'Тест',
    cycleMode: 'ONCE',
    machineTargets: [{ machineId, baseBehaviors: [] }],
    phases: [{ code: 'A', name: 'Фаза', durationMs: 5000, expectedState: 'RUN', behaviorOverrides: [] }],
  });

  it('список сценариев', async () => {
    const r = await call(`/scenarios?enterpriseId=${ENTERPRISE_ID}`);
    expect(r.status).toBe(200);
    expect(validate('ScenarioPage', r.json)).toEqual([]);
    expect(r.json.items.length).toBeGreaterThan(0);
    const d = await call(`/scenarios/${r.json.items[0].id}`);
    expect(validate('ScenarioDetail', d.json)).toEqual([]);
  });

  it('создание, валидация, активация сценария', async () => {
    const machineId = (await call(`/scenarios?enterpriseId=${ENTERPRISE_ID}`)).json.items[0] && (await call(`/scenarios/${(await call(`/scenarios?enterpriseId=${ENTERPRISE_ID}`)).json.items[0].id}`)).json.machineTargets[0].machineId;
    const v = await call('/scenarios/validate', { method: 'POST', body: draft('T_ONE', machineId) });
    expect(validate('ScenarioValidationResult', v.json)).toEqual([]);
    const bad = await call('/scenarios', { method: 'POST', body: draft('T_ONE', '00000000-0000-0000-0000-000000000000') });
    expect(bad.status).toBe(422);
    expect(validate('ErrorResponse', bad.json)).toEqual([]);
    const c = await call('/scenarios', { method: 'POST', body: draft('T_ONE', machineId) });
    expect(c.status).toBe(201);
    expect(c.json.status).toBe('DISABLED');
    expect(validate('ScenarioDetail', c.json)).toEqual([]);
    scenarioId = c.json.id;
    const dup = await call('/scenarios', { method: 'POST', body: draft('T_ONE', machineId) });
    expect(dup.status).toBe(409);
    const a = await call(`/scenarios/${scenarioId}/status`, { method: 'PUT', body: { status: 'ACTIVE' } });
    expect(a.status).toBe(200);
    expect(a.json.status).toBe('ACTIVE');
  });

  it('жизненный цикл запуска', async () => {
    const body = { mode: 'REALTIME', scenarioId, randomSeed: 7, durationMs: 60_000 };
    const v = await call('/runs/validate', { method: 'POST', body });
    expect(validate('RunValidationResult', v.json)).toEqual([]);
    expect(v.json.valid).toBe(true);

    const noKey = await call('/runs', { method: 'POST', body });
    expect(noKey.status).toBe(400);
    const created = await call('/runs', { method: 'POST', body, headers: { 'Idempotency-Key': 'key-0000001' } });
    expect(created.status).toBe(202);
    expect(validate('GenerationRunDetail', created.json)).toEqual([]);
    const again = await call('/runs', { method: 'POST', body, headers: { 'Idempotency-Key': 'key-0000001' } });
    expect(again.json.id).toBe(created.json.id);
    const reused = await call('/runs', { method: 'POST', body: { ...body, randomSeed: 8 }, headers: { 'Idempotency-Key': 'key-0000001' } });
    expect(reused.status).toBe(409);
    expect(reused.json.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const busy = await call('/runs', { method: 'POST', body, headers: { 'Idempotency-Key': 'key-0000002' } });
    expect(busy.status).toBe(409);

    const list = await call(`/runs?enterpriseId=${ENTERPRISE_ID}`);
    expect(validate('RunPage', list.json)).toEqual([]);
    expect(list.json.items[0].id).toBe(created.json.id);

    const stopped = await call(`/runs/${created.json.id}/stop`, { method: 'POST' });
    expect(stopped.status).toBe(202);
    expect(validate('GenerationRunDetail', stopped.json)).toEqual([]);
    const retry = await call(`/runs/${created.json.id}/retry`, { method: 'POST' });
    expect(retry.status).toBe(409);
  });

  it('исторический запуск и запуск по расписанию', async () => {
    const now = Date.now();
    const hist = await call('/runs/validate', {
      method: 'POST',
      body: { mode: 'HISTORICAL', scenarioId, from: new Date(now - 86_400_000).toISOString(), to: new Date(now - 3_600_000).toISOString() },
    });
    expect(validate('RunValidationResult', hist.json)).toEqual([]);
    const future = await call('/runs/validate', {
      method: 'POST',
      body: { mode: 'HISTORICAL', scenarioId, from: new Date(now).toISOString(), to: new Date(now + 3_600_000).toISOString() },
    });
    expect(future.json.valid).toBe(false);
    const sched = await call('/runs', {
      method: 'POST',
      body: { mode: 'SCHEDULED', scenarioId, scheduledStartAt: new Date(now + 3_600_000).toISOString(), durationMs: 60_000 },
      headers: { 'Idempotency-Key': 'key-sched-01' },
    });
    expect(sched.status).toBe(202);
    expect(sched.json.status).toBe('SCHEDULED');
    expect(validate('GenerationRunDetail', sched.json)).toEqual([]);
    const cancel = await call(`/runs/${sched.json.id}/stop`, { method: 'POST' });
    expect(cancel.status).toBe(200);
    expect(cancel.json.status).toBe('CANCELLED');
  });
});
