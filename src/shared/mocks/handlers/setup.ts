import { HttpResponse } from 'msw';
import type { components } from '../../api/generated/analytics';
import { toIso } from '../../lib/time';
import { wireMachine } from '../calc';
import { db } from '../db';
import type { MockMachine } from '../fixtures';
import { apiError, notFound, route } from './utils';

type S = components['schemas'];
type FieldError = { path: string; code: string; message: string };

const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const USER_STATES = ['RUN', 'IDLE', 'DOWN', 'SETUP', 'PLANNED_STOP'];
const now = () => toIso(Date.now(), db.tz());

const invalid = (fieldErrors: FieldError[]) => apiError(422, 'VALIDATION_FAILED', 'Request body is invalid', fieldErrors);
const conflict = (code: string, message: string, path?: string) =>
  apiError(409, code, message, path ? [{ path, code, message }] : []);

async function body(request: Request): Promise<Record<string, unknown>> {
  return ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
}

function checkCodeName(b: Record<string, unknown>) {
  const errors: FieldError[] = [];
  if (typeof b.code !== 'string' || !CODE.test(b.code)) errors.push({ path: 'code', code: 'INVALID_CODE', message: 'Код: латиница A–Z, цифры и _, с буквы' });
  if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 200) errors.push({ path: 'name', code: 'INVALID_NAME', message: 'Название от 1 до 200 символов' });
  return errors;
}

function readiness(m: MockMachine): S['ActivationReadiness'] {
  const errors: S['ValidationIssue'][] = [];
  const warnings: S['ValidationIssue'][] = [];
  if (!db.signals(m).length) errors.push({ code: 'NO_ACTIVE_SIGNALS', message: 'У машины нет активных сигналов' });
  if (!db.hasStateConfig(m)) errors.push({ code: 'STATE_CONFIGURATION_MISSING', message: 'Не заданы правила состояния' });
  if (!m.lineId) warnings.push({ code: 'MACHINE_NOT_ASSIGNED', message: 'Машина не назначена линии' });
  if (!m.nominalRate) warnings.push({ code: 'NOMINAL_RATE_MISSING', message: 'Не задана норма выпуска — производительность не будет рассчитана' });
  return { machineId: m.id, ready: errors.length === 0, errors, warnings, checkedAt: now() };
}

function collectSignals(cond: unknown, path: string, out: Array<{ path: string; signalId: unknown }>) {
  if (!cond || typeof cond !== 'object') return;
  const c = cond as Record<string, unknown>;
  if (c.type === 'COMPARE') out.push({ path: `${path}.signalId`, signalId: c.signalId });
  if (c.type === 'ALL' || c.type === 'ANY') (c.conditions as unknown[] | undefined)?.forEach((x, i) => collectSignals(x, `${path}.conditions[${i}]`, out));
  if (c.type === 'NOT') collectSignals(c.condition, `${path}.condition`, out);
}

function validateStateConfig(m: MockMachine, cfg: Record<string, unknown>): S['StateConfigurationValidation'] {
  const errors: S['ValidationIssue'][] = [];
  const warnings: S['ValidationIssue'][] = [];
  if (!USER_STATES.includes(cfg.defaultState as string)) errors.push({ code: 'INVALID_STATE', message: 'Недопустимое состояние по умолчанию', path: 'defaultState' });
  if (typeof cfg.offlineAfterMs !== 'number' || cfg.offlineAfterMs < 1) errors.push({ code: 'INVALID_VALUE', message: 'offlineAfterMs должен быть ≥ 1', path: 'offlineAfterMs' });
  const rules = Array.isArray(cfg.rules) ? (cfg.rules as Array<Record<string, unknown>>) : null;
  if (!rules || rules.length < 1 || rules.length > 20) errors.push({ code: 'RULES_COUNT', message: 'Нужно от 1 до 20 правил', path: 'rules' });
  const signalIds = new Set(db.signals(m).map((s) => s.id));
  rules?.forEach((r, i) => {
    if (typeof r.name !== 'string' || !r.name.trim()) errors.push({ code: 'REQUIRED', message: 'Укажите название правила', path: `rules[${i}].name` });
    if (!USER_STATES.includes(r.targetState as string)) errors.push({ code: 'INVALID_STATE', message: 'Недопустимое целевое состояние', path: `rules[${i}].targetState` });
    if (typeof r.priority !== 'number') errors.push({ code: 'REQUIRED', message: 'Укажите приоритет', path: `rules[${i}].priority` });
    const refs: Array<{ path: string; signalId: unknown }> = [];
    collectSignals(r.enterCondition, `rules[${i}].enterCondition`, refs);
    collectSignals(r.exitCondition, `rules[${i}].exitCondition`, refs);
    if (!refs.length) errors.push({ code: 'CONDITION_REQUIRED', message: 'Нужно хотя бы одно условие COMPARE', path: `rules[${i}].enterCondition` });
    for (const ref of refs) {
      if (!signalIds.has(ref.signalId as string)) errors.push({ code: 'UNKNOWN_SIGNAL', message: 'Сигнал не найден у этой машины', path: ref.path });
    }
    if ((r.activationDelayMs as number) === 0 && r.targetState === 'DOWN') warnings.push({ code: 'NO_DEBOUNCE', message: 'Без задержки активации DOWN может «дребезжать»', path: `rules[${i}].activationDelayMs` });
  });
  const valid = errors.length === 0;
  return {
    valid,
    normalizedConfiguration: valid ? (cfg as unknown as S['MachineStateConfigurationInput']) : null,
    errors,
    warnings,
    checkedAt: now(),
  };
}

export const setupHandlers = [
  route('post', '/enterprises', async ({ request }) => {
    const b = await body(request);
    const errors = checkCodeName(b);
    if (typeof b.timezone !== 'string' || !b.timezone) errors.push({ path: 'timezone', code: 'REQUIRED', message: 'Укажите часовой пояс' });
    if (errors.length) return invalid(errors);
    if (db.enterprises.some((e) => e.code === b.code)) return conflict('DUPLICATE_CODE', 'Предприятие с таким кодом уже есть', 'code');
    const e: S['Enterprise'] = { id: crypto.randomUUID(), code: b.code as string, name: b.name as string, timezone: b.timezone as string, status: 'ACTIVE', createdAt: now(), updatedAt: now() };
    db.enterprises.push(e);
    return HttpResponse.json(e, { status: 201 });
  }),
  route('post', '/enterprises/:enterpriseId/lines', async ({ params, request }) => {
    if (!db.enterprises.some((e) => e.id === params.enterpriseId)) return notFound('Предприятие');
    const b = await body(request);
    const errors = checkCodeName(b);
    if (errors.length) return invalid(errors);
    if (db.lines.some((l) => l.enterpriseId === params.enterpriseId && l.code === b.code)) return conflict('DUPLICATE_CODE', 'Линия с таким кодом уже есть', 'code');
    const line: S['ProductionLine'] = {
      id: crypto.randomUUID(),
      enterpriseId: params.enterpriseId as string,
      code: b.code as string,
      name: b.name as string,
      sortOrder: typeof b.sortOrder === 'number' ? b.sortOrder : db.lines.length + 1,
      status: 'ACTIVE',
      createdAt: now(),
      updatedAt: now(),
    };
    db.lines.push(line);
    return HttpResponse.json(line, { status: 201 });
  }),
  route('post', '/enterprises/:enterpriseId/machines', async ({ params, request }) => {
    if (!db.enterprises.some((e) => e.id === params.enterpriseId)) return notFound('Предприятие');
    const b = await body(request);
    const errors = checkCodeName(b);
    if (!Array.isArray(b.parameters)) errors.push({ path: 'parameters', code: 'REQUIRED', message: 'parameters обязателен' });
    if (b.nominalRate != null && !(typeof b.nominalRate === 'number' && b.nominalRate > 0)) errors.push({ path: 'nominalRate', code: 'INVALID_VALUE', message: 'Норма выпуска должна быть больше 0' });
    if (b.lineId && !db.lines.some((l) => l.id === b.lineId && l.enterpriseId === params.enterpriseId)) errors.push({ path: 'lineId', code: 'NOT_FOUND', message: 'Линия не найдена' });
    if (errors.length) return invalid(errors);
    if (db.machines.some((m) => m.enterpriseId === params.enterpriseId && m.code === b.code)) return conflict('DUPLICATE_CODE', 'Машина с таким кодом уже есть', 'code');
    const m: MockMachine = {
      id: crypto.randomUUID(),
      enterpriseId: params.enterpriseId as string,
      lineId: (b.lineId as string | null) ?? null,
      code: b.code as string,
      name: b.name as string,
      machineType: (b.machineType as string | null) ?? null,
      inventoryNo: (b.inventoryNo as string | null) ?? null,
      manufacturer: (b.manufacturer as string | null) ?? null,
      model: (b.model as string | null) ?? null,
      commissioningYear: (b.commissioningYear as number | null) ?? null,
      nominalRate: (b.nominalRate as number | null) ?? 0,
      productionUnit: (b.productionUnit as string | null) ?? null,
      sortOrder: (b.sortOrder as number | null) ?? null,
      status: 'DISABLED',
      coverageFrom: null,
      parameters: b.parameters as S['TypedParameter'][],
      createdAt: now(),
      updatedAt: now(),
      profile: 'average',
      custom: true,
    };
    db.machines.push(m);
    return HttpResponse.json(wireMachine(m), { status: 201 });
  }),
  route('post', '/lines/:lineId/machine-assignments', async ({ params, request }) => {
    const line = db.lines.find((l) => l.id === params.lineId);
    if (!line) return notFound('Линия');
    const ids = (await body(request)).machineIds;
    if (!Array.isArray(ids) || !ids.length) return invalid([{ path: 'machineIds', code: 'REQUIRED', message: 'Выберите машины' }]);
    const machines = ids.map((id) => db.machines.find((m) => m.id === id));
    if (machines.some((m) => !m || m.enterpriseId !== line.enterpriseId)) return notFound('Машина');
    const taken = machines.find((m) => m!.lineId);
    if (taken) return conflict('MACHINE_ALREADY_ASSIGNED', `Машина ${taken.code} уже назначена линии`);
    for (const m of machines) {
      m!.lineId = line.id;
      m!.updatedAt = now();
    }
    return HttpResponse.json({ items: machines.map((m) => wireMachine(m!)) });
  }),
  route('get', '/machines/:machineId/components', ({ params }) => {
    if (!db.machine(params.machineId as string)) return notFound('Машина');
    return HttpResponse.json({ items: db.components.get(params.machineId as string) ?? [] });
  }),
  route('post', '/machines/:machineId/components', async ({ params, request }) => {
    const m = db.machine(params.machineId as string);
    if (!m) return notFound('Машина');
    const b = await body(request);
    const errors = checkCodeName(b);
    const list = db.components.get(m.id) ?? [];
    if (b.parentComponentId && !list.some((c) => c.id === b.parentComponentId)) errors.push({ path: 'parentComponentId', code: 'NOT_FOUND', message: 'Родительский компонент не найден у этой машины' });
    if (typeof b.kind !== 'string') errors.push({ path: 'kind', code: 'REQUIRED', message: 'Укажите вид' });
    if (errors.length) return invalid(errors);
    if (list.some((c) => c.code === b.code)) return conflict('DUPLICATE_CODE', 'Компонент с таким кодом уже есть', 'code');
    const c: S['Component'] = {
      id: crypto.randomUUID(),
      machineId: m.id,
      parentComponentId: (b.parentComponentId as string | null) ?? null,
      code: b.code as string,
      name: b.name as string,
      kind: b.kind as S['ComponentKind'],
      sortOrder: (b.sortOrder as number) ?? list.length * 10,
      status: 'ACTIVE',
      parameters: (b.parameters as S['TypedParameter'][]) ?? [],
      createdAt: now(),
      updatedAt: now(),
    };
    db.components.set(m.id, [...list, c]);
    return HttpResponse.json(c, { status: 201 });
  }),
  route('post', '/machines/:machineId/telemetry-signals', async ({ params, request }) => {
    const m = db.machine(params.machineId as string);
    if (!m) return notFound('Машина');
    const b = await body(request);
    const errors = checkCodeName(b);
    const numeric = b.valueType === 'DOUBLE' || b.valueType === 'LONG';
    if (!['DOUBLE', 'LONG', 'BOOLEAN', 'STRING'].includes(b.valueType as string)) errors.push({ path: 'valueType', code: 'INVALID_VALUE', message: 'Недопустимый тип' });
    if (!numeric && b.signalKind !== 'STATE') errors.push({ path: 'signalKind', code: 'INCOMPATIBLE', message: 'Для нечисловых сигналов допустим только STATE' });
    if (!numeric && b.unitCode) errors.push({ path: 'unitCode', code: 'INCOMPATIBLE', message: 'Единица только для числовых сигналов' });
    if (typeof b.semanticCode !== 'string' || !b.semanticCode) errors.push({ path: 'semanticCode', code: 'REQUIRED', message: 'Укажите семантику' });
    if (b.componentId && !(db.components.get(m.id) ?? []).some((c) => c.id === b.componentId)) errors.push({ path: 'componentId', code: 'NOT_FOUND', message: 'Компонент не найден у этой машины' });
    if (errors.length) return invalid(errors);
    if (db.signals(m).some((s) => s.code === b.code)) return conflict('DUPLICATE_CODE', 'Сигнал с таким кодом уже есть', 'code');
    const s: S['TelemetrySignal'] = {
      id: crypto.randomUUID(),
      machineId: m.id,
      componentId: (b.componentId as string | null) ?? null,
      code: b.code as string,
      name: b.name as string,
      description: (b.description as string | null) ?? null,
      valueType: b.valueType as S['SignalValueType'],
      signalKind: b.signalKind as S['SignalKind'],
      semanticCode: b.semanticCode as string,
      customSemanticCode: (b.customSemanticCode as string | null) ?? null,
      unitCode: (b.unitCode as string | null) ?? null,
      expectedIntervalMs: (b.expectedIntervalMs as number | null) ?? null,
      staleAfterMs: (b.staleAfterMs as number | null) ?? null,
      validMin: (b.validMin as number | null) ?? null,
      validMax: (b.validMax as number | null) ?? null,
      featured: !!b.featured,
      displayOrder: (b.displayOrder as number | null) ?? null,
      status: 'ACTIVE',
      hasRawData: false,
      createdAt: now(),
      updatedAt: now(),
    };
    db.createdSignals.set(m.id, [...(db.createdSignals.get(m.id) ?? []), s]);
    return HttpResponse.json(s, { status: 201 });
  }),
  route('get', '/machines/:machineId/activation-readiness', ({ params }) => {
    const m = db.machine(params.machineId as string);
    return m ? HttpResponse.json(readiness(m)) : notFound('Машина');
  }),
  route('put', '/machines/:machineId/status', async ({ params, request }) => {
    const m = db.machine(params.machineId as string);
    if (!m) return notFound('Машина');
    const status = (await body(request)).status;
    if (status !== 'ACTIVE' && status !== 'DISABLED') return invalid([{ path: 'status', code: 'INVALID_VALUE', message: 'ACTIVE или DISABLED' }]);
    if (status === 'ACTIVE' && !readiness(m).ready) return conflict('MACHINE_NOT_READY', 'Машина не готова к активации');
    m.status = status;
    m.updatedAt = now();
    if (status === 'ACTIVE' && !m.coverageFrom) m.coverageFrom = now();
    return HttpResponse.json(wireMachine(m));
  }),
  route('get', '/machines/:machineId/state-configuration', ({ params }) => {
    const m = db.machine(params.machineId as string);
    if (!m) return notFound('Машина');
    const cfg = db.stateConfigs.get(m.id);
    return cfg ? HttpResponse.json(cfg) : notFound('Конфигурация состояния');
  }),
  route('post', '/machines/:machineId/state-configuration/validate', async ({ params, request }) => {
    const m = db.machine(params.machineId as string);
    if (!m) return notFound('Машина');
    return HttpResponse.json(validateStateConfig(m, await body(request)));
  }),
  route('put', '/machines/:machineId/state-configuration', async ({ params, request }) => {
    const m = db.machine(params.machineId as string);
    if (!m) return notFound('Машина');
    const cfg = await body(request);
    const v = validateStateConfig(m, cfg);
    if (!v.valid) return invalid(v.errors.map((e) => ({ path: e.path ?? '', code: e.code, message: e.message })));
    const saved: S['MachineStateConfiguration'] = {
      machineId: m.id,
      defaultState: cfg.defaultState as S['UserMachineState'],
      offlineAfterMs: cfg.offlineAfterMs as number,
      rules: (cfg.rules as S['StateRuleInput'][]).map((r) => ({ ...r, id: r.id ?? crypto.randomUUID() })),
      updatedAt: now(),
    };
    db.stateConfigs.set(m.id, saved);
    return HttpResponse.json(saved);
  }),
];
