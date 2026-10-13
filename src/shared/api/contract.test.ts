import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { MOCK_CONFIG } from '../mocks/config';
import { ENTERPRISE_ID, LINES, LOSS_REASONS, MACHINES, SHIFTS, signalsOf } from '../mocks/fixtures';
import { handlers } from '../mocks/handlers';
import { localDate, toIso } from '../lib/time';

const spec = parse(readFileSync('openapi/analytics-api.yaml', 'utf8'));
const allOfBases = new Set<string>();
for (const schema of Object.values(spec.components.schemas) as Array<{ allOf?: Array<{ $ref?: string }> }>) {
  for (const part of schema.allOf ?? []) if (part.$ref) allOfBases.add(part.$ref.split('/').pop()!);
}
for (const name of allOfBases) delete spec.components.schemas[name].additionalProperties;
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(spec, 'analytics');

const validate = (schema: string, data: unknown) => {
  const fn = ajv.getSchema(`analytics#/components/schemas/${schema}`)!;
  const ok = fn(data);
  return ok ? [] : (fn.errors ?? []).map((e) => `${e.instancePath} ${e.message} ${JSON.stringify(e.params)}`);
};

const METHODS = ['get', 'post', 'put', 'delete'];
const specOps = new Set(
  Object.entries(spec.paths as Record<string, Record<string, unknown>>).flatMap(([path, item]) =>
    METHODS.filter((m) => m in item).map((m) => `${m.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ':$1')}`),
  ),
);
const mockOps = handlers.filter((h) => String(h.info.path).includes('/api/analytics/')).map((h) => `${h.info.method} ${String(h.info.path).replace(/^\*\/api\/analytics\/api\/v1/, '').replace(/:\w+/g, (p) => p)}`);
const normalize = (op: string) => op.replace(/:\w+/g, ':p');

const server = setupServer(...handlers);
const BASE = 'http://localhost/api/analytics/api/v1';
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
  return { status: res.status, json: res.status === 204 ? null : await res.json() };
}

const now = Date.now();
const enc = encodeURIComponent;
const day = `from=${enc(toIso(now - 86_400_000))}&to=${enc(toIso(now))}`;
const week = `from=${enc(toIso(now - 7 * 86_400_000))}&to=${enc(toIso(now))}`;
const machine = MACHINES[1];
const signal = signalsOf(machine)[0];

describe('мок-хендлеры ⊂ analytics-api.yaml', () => {
  it('каждый маршрут мока есть в спеке бэкенда', () => {
    const spec = new Set([...specOps].map(normalize));
    expect(mockOps.map(normalize).filter((op) => !spec.has(op))).toEqual([]);
  });
});

describe('ответы моков валидны по схемам бэкенда', () => {
  const cases: Array<[string, string]> = [
    ['EnterprisePage', '/enterprises'],
    ['Enterprise', `/enterprises/${ENTERPRISE_ID}`],
    ['ShiftPage', `/enterprises/${ENTERPRISE_ID}/shifts`],
    ['LossReasonPage', `/enterprises/${ENTERPRISE_ID}/loss-reasons`],
    ['LossReason', `/loss-reasons/${LOSS_REASONS[0].id}`],
    ['ProductionLinePage', `/enterprises/${ENTERPRISE_ID}/lines`],
    ['ProductionLine', `/lines/${LINES[0].id}`],
    ['MachinePage', `/lines/${LINES[0].id}/machines`],
    ['MachinePage', `/enterprises/${ENTERPRISE_ID}/machines`],
    ['Machine', `/machines/${machine.id}`],
    ['TelemetrySignalPage', `/machines/${machine.id}/telemetry-signals`],
    ['EquipmentTree', `/enterprises/${ENTERPRISE_ID}/equipment-tree`],
    ['OperationsOverview', `/enterprises/${ENTERPRISE_ID}/operations/overview`],
    ['MachineOperationsCurrent', `/machines/${machine.id}/operations/current`],
    ['CurrentState', `/machines/${machine.id}/current-state`],
    ['CurrentTelemetryResponse', `/machines/${machine.id}/telemetry/current`],
    ['AnalyticsSummary', `/analytics/summary?scope=MACHINE&scopeId=${machine.id}&${day}`],
    ['AnalyticsSummary', `/analytics/summary?scope=ENTERPRISE&scopeId=${ENTERPRISE_ID}&shiftId=${SHIFTS[0].id}&shiftDate=${localDate(now - 86_400_000, 'Europe/Moscow')}`],
    ['MetricTimeseries', `/analytics/metrics/timeseries?scope=LINE&scopeId=${LINES[0].id}&${week}`],
    ['TelemetrySeries', `/machines/${machine.id}/telemetry/series?signalId=${signal.id}&${day}`],
    ['TelemetrySeries', `/machines/${machine.id}/telemetry/series?signalId=${signalsOf(machine)[3].id}&${day}&resolution=1h`],
    ['LossTimeseries', `/analytics/losses/timeseries?scope=MACHINE&scopeId=${machine.id}&${day}&top=3`],
    ['LossPareto', `/analytics/losses/pareto?scope=ENTERPRISE&scopeId=${ENTERPRISE_ID}&${week}`],
    ['ChronometryResponse', `/machines/${machine.id}/chronometry?shiftDate=${localDate(now - 86_400_000, 'Europe/Moscow')}`],
    ['StateIntervalPage', `/machines/${machine.id}/state-intervals?${day}&limit=20`],
    ['StateIntervalPage', `/machines/${machine.id}/state-intervals?${week}&unclassifiedOnly=true&lossOnly=true`],
    ['ManualIncidentPage', `/enterprises/${ENTERPRISE_ID}/incidents?${week}`],
  ];

  it.each(cases)('%s ← GET %s', async (schema, path) => {
    const r = await call(path);
    expect(r.status).toBe(200);
    expect(validate(schema, r.json)).toEqual([]);
  });

  it('401 без токена, ErrorResponse по схеме', async () => {
    const res = await fetch(`${BASE}/enterprises`);
    expect(res.status).toBe(401);
    expect(validate('ErrorResponse', await res.json())).toEqual([]);
  });

  it('login → LoginResponse; невалидный логин → 400 с fieldErrors', async () => {
    const ok = await call('/auth/login', { method: 'POST', body: { username: 'demo', password: 'demo-password-1' } });
    expect(validate('LoginResponse', ok.json)).toEqual([]);
    const bad = await call('/auth/login', { method: 'POST', body: { username: 'x', password: 'y' } });
    expect(bad.status).toBe(400);
    expect(bad.json.fieldErrors.map((e: { path: string }) => e.path).sort()).toEqual(['password', 'username']);
  });

  it('курсорная пагинация интервалов', async () => {
    const first = await call(`/machines/${machine.id}/state-intervals?${week}&limit=10`);
    expect(first.json.cursor.hasMore).toBe(true);
    const second = await call(`/machines/${machine.id}/state-intervals?${week}&limit=10&cursor=${first.json.cursor.nextCursor}`);
    expect(second.json.items[0].from).toBe(first.json.items[9].to);
  });
});

describe('ручные инциденты', () => {
  const body = {
    from: toIso(now - 3 * 3_600_000),
    to: toIso(now - 2 * 3_600_000),
    lossReasonId: LOSS_REASONS[4].id,
    comment: 'тест',
    author: 'Мастер смены',
  };

  it('создание, идемпотентность, overlay причины, закрытие, отмена', async () => {
    const key = { 'Idempotency-Key': `test-${now}` };
    const created = await call(`/machines/${machine.id}/incidents`, { method: 'POST', body, headers: key });
    expect(created.status).toBe(201);
    expect(validate('ManualIncident', created.json)).toEqual([]);
    expect(created.json.effectType).toBe('LOSS_ANNOTATION');
    const again = await call(`/machines/${machine.id}/incidents`, { method: 'POST', body, headers: key });
    expect(again.json.id).toBe(created.json.id);

    const intervals = await call(`/machines/${machine.id}/state-intervals?from=${enc(body.from)}&to=${enc(body.to)}&lossOnly=true`);
    const stops = intervals.json.items.filter((i: { effectiveState: string }) => i.effectiveState === 'IDLE' || i.effectiveState === 'DOWN');
    for (const s of stops) expect(s.lossReason?.id).toBe(LOSS_REASONS[4].id);

    const override = await call(`/machines/${machine.id}/incidents`, {
      method: 'POST',
      body: { from: toIso(now - 3_600_000), to: null, stateOverride: 'SETUP' },
      headers: { 'Idempotency-Key': `test-ovr-${now}` },
    });
    expect(override.json.effectType).toBe('STATE_OVERRIDE');
    const cur = await call(`/machines/${machine.id}/current-state`);
    expect(cur.json.effectiveState).toBe('SETUP');
    expect(cur.json.stateSource).toBe('MANUAL');

    const closed = await call(`/incidents/${override.json.id}/close`, { method: 'PUT', body: { to: toIso(now - 60_000) } });
    expect(validate('ManualIncident', closed.json)).toEqual([]);
    expect((await call(`/incidents/${created.json.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await call(`/incidents/${created.json.id}`)).json.cancelledAt).not.toBeNull();
  });

  it('400 без Idempotency-Key, без причины и состояния, с концом раньше начала', async () => {
    expect((await call(`/machines/${machine.id}/incidents`, { method: 'POST', body })).status).toBe(400);
    const h = { 'Idempotency-Key': `test-bad-${now}` };
    const r1 = await call(`/machines/${machine.id}/incidents`, { method: 'POST', body: { from: body.from }, headers: h });
    expect(r1.status).toBe(400);
    expect(validate('ErrorResponse', r1.json)).toEqual([]);
    const r2 = await call(`/machines/${machine.id}/incidents`, { method: 'POST', body: { ...body, to: body.from, from: body.to }, headers: { 'Idempotency-Key': `test-bad2-${now}` } });
    expect(r2.status).toBe(400);
  });
});

describe('настройка оборудования (Epic 2)', () => {
  it('линия → машина DISABLED → назначение → компонент → сигнал → правила → активация', async () => {
    const line = await call(`/enterprises/${ENTERPRISE_ID}/lines`, { method: 'POST', body: { code: 'LINE_TEST', name: 'Тестовая линия' } });
    expect(line.status).toBe(201);
    expect(validate('ProductionLine', line.json)).toEqual([]);
    expect((await call(`/enterprises/${ENTERPRISE_ID}/lines`, { method: 'POST', body: { code: 'LINE_TEST', name: 'Дубль' } })).status).toBe(409);
    expect((await call(`/enterprises/${ENTERPRISE_ID}/lines`, { method: 'POST', body: { code: 'bad code', name: '' } })).status).toBe(422);

    const machine = await call(`/enterprises/${ENTERPRISE_ID}/machines`, { method: 'POST', body: { code: 'TEST_M', name: 'Тестовая', nominalRate: 100, parameters: [] } });
    expect(machine.status).toBe(201);
    expect(validate('Machine', machine.json)).toEqual([]);
    expect(machine.json.status).toBe('DISABLED');
    const id = machine.json.id;

    const unassigned = await call(`/enterprises/${ENTERPRISE_ID}/machines?assignment=UNASSIGNED&status=DISABLED`);
    expect(unassigned.json.items.map((m: { id: string }) => m.id)).toContain(id);
    const assigned = await call(`/lines/${line.json.id}/machine-assignments`, { method: 'POST', body: { machineIds: [id] } });
    expect(assigned.json.items[0].lineId).toBe(line.json.id);
    expect((await call(`/lines/${LINES[0].id}/machine-assignments`, { method: 'POST', body: { machineIds: [id] } })).status).toBe(409);

    const notReady = await call(`/machines/${id}/activation-readiness`);
    expect(validate('ActivationReadiness', notReady.json)).toEqual([]);
    expect(notReady.json.ready).toBe(false);
    expect((await call(`/machines/${id}/status`, { method: 'PUT', body: { status: 'ACTIVE' } })).status).toBe(409);

    const comp = await call(`/machines/${id}/components`, { method: 'POST', body: { code: 'DRIVE', name: 'Привод', kind: 'DRIVE', sortOrder: 0, parameters: [] } });
    expect(validate('Component', comp.json)).toEqual([]);
    const sig = await call(`/machines/${id}/telemetry-signals`, {
      method: 'POST',
      body: { componentId: comp.json.id, code: 'SPEED', name: 'Скорость', valueType: 'DOUBLE', signalKind: 'GAUGE', semanticCode: 'LINEAR_SPEED', unitCode: 'M_MIN', featured: true },
    });
    expect(validate('TelemetrySignal', sig.json)).toEqual([]);
    expect((await call(`/machines/${id}/telemetry-signals`, { method: 'POST', body: { code: 'FLAG', name: 'Флаг', valueType: 'BOOLEAN', signalKind: 'GAUGE', semanticCode: 'READY_FLAG', featured: false } })).status).toBe(422);

    const config = {
      defaultState: 'IDLE',
      offlineAfterMs: 60000,
      rules: [{ name: 'Работа', priority: 10, targetState: 'RUN', enterCondition: { type: 'COMPARE', signalId: sig.json.id, operator: 'GT', value: 0 }, activationDelayMs: 0, releaseDelayMs: 0 }],
    };
    const bad = await call(`/machines/${id}/state-configuration/validate`, {
      method: 'POST',
      body: { ...config, rules: [{ ...config.rules[0], enterCondition: { ...config.rules[0].enterCondition, signalId: LINES[0].id } }] },
    });
    expect(validate('StateConfigurationValidation', bad.json)).toEqual([]);
    expect(bad.json.valid).toBe(false);
    const ok = await call(`/machines/${id}/state-configuration/validate`, { method: 'POST', body: config });
    expect(ok.json.valid).toBe(true);
    const saved = await call(`/machines/${id}/state-configuration`, { method: 'PUT', body: config });
    expect(validate('MachineStateConfiguration', saved.json)).toEqual([]);

    expect((await call(`/machines/${id}/activation-readiness`)).json.ready).toBe(true);
    const active = await call(`/machines/${id}/status`, { method: 'PUT', body: { status: 'ACTIVE' } });
    expect(validate('Machine', active.json)).toEqual([]);
    expect(active.json.status).toBe('ACTIVE');
  });
});

describe('админские моки валидны по схемам бэкенда', () => {
  const ent = ENTERPRISE_ID;
  it('смены: создание, правка, статус', async () => {
    const bad = await call(`/enterprises/${ent}/shifts`, { method: 'POST', body: { code: 'x', name: '', startLocalTime: '25:00', endLocalTime: '08:00', validFrom: '2026-01-01' } });
    expect(bad.status).toBe(422);
    expect(validate('ErrorResponse', bad.json)).toEqual([]);
    const created = await call(`/enterprises/${ent}/shifts`, { method: 'POST', body: { code: 'EVENING', name: 'Вечер', startLocalTime: '16:00', endLocalTime: '00:00', validFrom: '2026-01-01', validTo: null, sortOrder: 5 } });
    expect(created.status).toBe(201);
    expect(validate('Shift', created.json)).toEqual([]);
    const upd = await call(`/shifts/${created.json.id}`, { method: 'PUT', body: { name: 'Вечерняя', startLocalTime: '16:00', endLocalTime: '23:00', validFrom: '2026-01-01', validTo: null, sortOrder: 5 } });
    expect(upd.status).toBe(200);
    expect(upd.json.endLocalTime).toBe('23:00');
    const used = await call(`/shifts/${SHIFTS[0].id}`, { method: 'PUT', body: { name: 'День', startLocalTime: '09:00', endLocalTime: '20:00', validFrom: '2026-06-01', validTo: null, sortOrder: 1 } });
    expect(used.status).toBe(409);
    const off = await call(`/shifts/${created.json.id}/status`, { method: 'PUT', body: { status: 'DISABLED' } });
    expect(off.json.status).toBe('DISABLED');
  });

  it('причины потерь и линии', async () => {
    const r = await call(`/enterprises/${ent}/loss-reasons`, { method: 'POST', body: { code: 'TEST_REASON', name: 'Тест', category: 'OTHER', color: '#112233' } });
    expect(r.status).toBe(201);
    expect(validate('LossReason', r.json)).toEqual([]);
    expect((await call(`/enterprises/${ent}/loss-reasons`, { method: 'POST', body: { code: 'TEST_REASON', name: 'Тест', category: 'OTHER' } })).status).toBe(409);
    const u = await call(`/loss-reasons/${r.json.id}`, { method: 'PUT', body: { name: 'Тест 2', category: 'PROCESS', description: null, color: null } });
    expect(validate('LossReason', u.json)).toEqual([]);
    const line = await call(`/lines/${LINES[0].id}`, { method: 'PUT', body: { name: 'Переименована', sortOrder: 1 } });
    expect(validate('ProductionLine', line.json)).toEqual([]);
    const blocked = await call(`/lines/${LINES[0].id}/status`, { method: 'PUT', body: { status: 'DISABLED' } });
    expect(blocked.status).toBe(409);
  });

  it('предприятие, машина, компонент, сигнал', async () => {
    const e = await call(`/enterprises/${ent}`, { method: 'PUT', body: { name: 'Завод', timezone: 'Europe/Moscow' } });
    expect(validate('Enterprise', e.json)).toEqual([]);
    expect((await call(`/enterprises/${ent}/status`, { method: 'PUT', body: { status: 'DISABLED' } })).status).toBe(409);

    const m = await call(`/machines/${MACHINES[0].id}`, { method: 'PUT', body: { name: 'Экструдер', machineType: null, nominalRate: 1300, parameters: [] } });
    expect(m.status).toBe(200);
    expect(validate('Machine', m.json)).toEqual([]);
    expect((await call(`/machines/${MACHINES[0].id}`, { method: 'PUT', body: { name: 'X', nominalRate: -1, parameters: [] } })).status).toBe(422);

    const sig = signalsOf(MACHINES[0])[0];
    const s = await call(`/telemetry-signals/${sig.id}`, { method: 'PUT', body: { name: 'Скорость 2', valueType: 'DOUBLE', signalKind: 'GAUGE', semanticCode: 'SPEED', featured: true } });
    expect(validate('TelemetrySignal', s.json)).toEqual([]);
    expect(s.json.name).toBe('Скорость 2');
    const off = await call(`/telemetry-signals/${sig.id}/status`, { method: 'PUT', body: { status: 'DISABLED' } });
    expect(off.json.status).toBe('DISABLED');

    const parent = await call(`/machines/${MACHINES[0].id}/components`, { method: 'POST', body: { code: 'MOTOR_A', name: 'Мотор', kind: 'MOTOR', sortOrder: 0, parameters: [] } });
    const child = await call(`/machines/${MACHINES[0].id}/components`, { method: 'POST', body: { code: 'BEARING_A', name: 'Подшипник', kind: 'BEARING', sortOrder: 0, parameters: [], parentComponentId: parent.json.id } });
    expect(validate('Component', child.json)).toEqual([]);
    const cycle = await call(`/components/${parent.json.id}/parent`, { method: 'PUT', body: { parentComponentId: child.json.id } });
    expect(cycle.status).toBe(409);
    const off2 = await call(`/components/${child.json.id}/status`, { method: 'PUT', body: { status: 'DISABLED' } });
    expect(off2.json.status).toBe('DISABLED');
    const active = await call(`/machines/${MACHINES[0].id}/components?status=ACTIVE`);
    expect(active.json.items.map((c: { code: string }) => c.code)).toEqual(['MOTOR_A']);
  });
});
