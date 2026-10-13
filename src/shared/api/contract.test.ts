import { readFileSync } from 'node:fs';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';
import { MOCK_CONFIG } from '../mocks/config';
import { handlers } from '../mocks/handlers';
import { toIso } from '../lib/time';
import * as C from './contract';

const spec = parse(readFileSync('openapi.yaml', 'utf8')) as { paths: Record<string, Record<string, unknown>> };
const METHODS = ['get', 'post', 'put', 'delete'];
const specOps = Object.entries(spec.paths)
  .flatMap(([path, item]) => METHODS.filter((m) => m in item).map((m) => `${m.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ':$1')}`))
  .sort();
const mockOps = handlers.map((h) => `${h.info.method} ${String(h.info.path).replace(/^\*\/api\/analytics/, '')}`).sort();

const server = setupServer(...handlers);
const BASE = 'http://localhost/api/analytics';

beforeAll(() => {
  MOCK_CONFIG.latencyMs = [0, 0];
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => server.close());

async function call<S extends z.ZodType>(schema: S, path: string, init?: { method?: string; body?: unknown }) {
  const res = await fetch(BASE + path, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = res.status === 204 ? null : await res.json();
  return { status: res.status, json, parsed: res.ok ? schema.safeParse(json) : null };
}

const now = Date.now();
const range = `from=${encodeURIComponent(toIso(now - 86_400_000))}&to=${encodeURIComponent(toIso(now))}`;

describe('openapi.yaml ↔ мок-хендлеры', () => {
  it('каждая операция спеки реализована в моках и наоборот', () => {
    expect(mockOps).toEqual(specOps);
  });
});

describe('ответы моков соответствуют контракту', () => {
  const cases: Array<[string, z.ZodType, string]> = [
    ['enterprises', z.array(C.EnterpriseSchema), '/enterprises'],
    ['enterprise', C.EnterpriseSchema, '/enterprises/ent-1'],
    ['lines', z.array(C.LineSchema), '/enterprises/ent-1/lines'],
    ['line', C.LineSchema, '/lines/line-1'],
    ['machines', z.array(C.MachineSchema), '/lines/line-1/machines'],
    ['machine', C.MachineSchema, '/machines/m-101'],
    ['loss-reasons', z.array(C.LossReasonSchema), '/loss-reasons'],
    ['incidents', z.array(C.IncidentSchema), '/incidents?machineId=m-101'],
    ['intervals', z.array(C.StateIntervalSchema), `/machines/m-101/intervals?${range}`],
    ['summary', C.SummarySchema, `/analytics/summary?scope=enterprise&id=ent-1&${range}`],
    ['current-states', z.array(C.CurrentStateSchema), '/analytics/current-states?enterpriseId=ent-1'],
    ['losses/timeseries', z.array(C.LossesBucketSchema), `/analytics/losses/timeseries?scope=machine&id=m-101&bucket=hour&${range}`],
    ['losses/pareto', z.array(C.ParetoRowSchema), `/analytics/losses/pareto?scope=line&id=line-1&top=5&${range}`],
    ['chronometry', C.ChronometrySchema, `/analytics/chronometry?machineId=m-101&date=${toIso(now - 86_400_000).slice(0, 10)}&shift=day`],
    ['telemetry/latest', C.TelemetryLatestSchema, '/machines/m-101/telemetry/latest'],
    ['telemetry/series', C.TelemetrySeriesSchema, `/machines/m-101/telemetry/series?signal=speed&${range}`],
  ];

  it.each(cases)('GET %s', async (_, schema, path) => {
    const r = await call(schema, path);
    expect(r.status).toBe(200);
    expect(r.parsed?.error?.issues ?? []).toEqual([]);
  });

  it('400 и 404 для текущих состояний и некорректного периода', async () => {
    expect((await call(z.unknown(), '/analytics/current-states')).status).toBe(400);
    expect((await call(z.unknown(), '/analytics/current-states?enterpriseId=nope')).status).toBe(404);
    expect((await call(z.unknown(), '/incidents?from=bad')).status).toBe(400);
  });

  it('404 для неизвестной машины', async () => {
    const r = await call(C.MachineSchema, '/machines/nope');
    expect(r.status).toBe(404);
    expect(r.json).toHaveProperty('message');
  });
});

describe('запись', () => {
  const incident: C.IncidentInput = {
    machineId: 'm-101',
    from: toIso(now - 3_600_000),
    to: toIso(now - 1_800_000),
    reasonId: 'r-operator',
    comment: 'тест',
    author: 'Мастер смены',
  };

  it('инцидент: создание, чтение, изменение, удаление', async () => {
    const created = await call(C.IncidentSchema, '/incidents', { method: 'POST', body: incident });
    expect(created.status).toBe(201);
    const id = created.parsed!.data!.id as string;
    expect((await call(C.IncidentSchema, `/incidents/${id}`)).parsed?.success).toBe(true);
    const updated = await call(C.IncidentSchema, `/incidents/${id}`, { method: 'PUT', body: { ...incident, comment: 'изм.' } });
    expect(updated.json.comment).toBe('изм.');
    expect((await call(z.null(), `/incidents/${id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await call(C.IncidentSchema, `/incidents/${id}`)).status).toBe(404);
  });

  it('инцидент: 400 при конце раньше начала и неполном теле', async () => {
    expect((await call(C.IncidentSchema, '/incidents', { method: 'POST', body: { ...incident, to: incident.from, from: incident.to } })).status).toBe(400);
    expect((await call(C.IncidentSchema, '/incidents', { method: 'POST', body: { machineId: 'm-101' } })).status).toBe(400);
  });

  it('справочники: линия, машина, причина', async () => {
    const line = await call(C.LineSchema, '/enterprises/ent-1/lines', { method: 'POST', body: { name: 'Линия 4', order: 4 } });
    expect(line.status).toBe(201);
    const machine = await call(C.MachineSchema, `/lines/${line.json.id}/machines`, {
      method: 'POST',
      body: {
        lineId: line.json.id,
        name: 'Новая',
        type: 'Тест',
        inventoryNo: 'ИН-1',
        nominalRate: 100,
        order: 1,
        params: [],
        opcTags: [],
        stateRules: [],
        thresholds: { availability: { good: 0.85, warn: 0.6 } },
      },
    });
    expect(machine.parsed?.success).toBe(true);
    const reason = await call(C.LossReasonSchema, '/loss-reasons', {
      method: 'POST',
      body: { name: 'Прочее', group: 'Организационные', isPlanned: false, color: '#888888' },
    });
    expect(reason.status).toBe(201);
    const renamed = await call(C.LossReasonSchema, `/loss-reasons/${reason.json.id}`, {
      method: 'PUT',
      body: { name: 'Прочее (изм.)', group: 'Организационные', isPlanned: false, color: '#888888' },
    });
    expect(renamed.json.name).toBe('Прочее (изм.)');
  });
});
