import { HttpResponse } from 'msw';
import type { components } from '../../api/generated/analytics';
import { toIso } from '../../lib/time';
import { wireMachine } from '../calc';
import { db } from '../db';
import { apiError, notFound, route } from './utils';

type S = components['schemas'];
type FieldError = { path: string; code: string; message: string };
type Body = Record<string, unknown>;

const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const now = () => toIso(Date.now(), db.tz());
const body = async (r: Request) => ((await r.json().catch(() => ({}))) ?? {}) as Body;
const invalid = (fieldErrors: FieldError[]) => apiError(422, 'VALIDATION_FAILED', 'Request body is invalid', fieldErrors);
const conflict = (code: string, message: string, path?: string) => apiError(409, code, message, path ? [{ path, code, message }] : []);
const name = (b: Body): FieldError[] =>
  typeof b.name !== 'string' || !b.name.trim() || b.name.length > 200 ? [{ path: 'name', code: 'INVALID_NAME', message: 'Название от 1 до 200 символов' }] : [];
const code = (b: Body): FieldError[] =>
  typeof b.code !== 'string' || !CODE.test(b.code) ? [{ path: 'code', code: 'INVALID_CODE', message: 'Код: латиница A–Z, цифры и _, с буквы' }] : [];
const parseStatus = (b: Body) => (b.status === 'ACTIVE' || b.status === 'DISABLED' ? b.status : null);
const badStatus = () => invalid([{ path: 'status', code: 'INVALID_VALUE', message: 'ACTIVE или DISABLED' }]);

function shiftErrors(b: Body): FieldError[] {
  const e = name(b);
  if (typeof b.startLocalTime !== 'string' || !TIME.test(b.startLocalTime)) e.push({ path: 'startLocalTime', code: 'INVALID_TIME', message: 'Время в формате ЧЧ:ММ' });
  if (typeof b.endLocalTime !== 'string' || !TIME.test(b.endLocalTime)) e.push({ path: 'endLocalTime', code: 'INVALID_TIME', message: 'Время в формате ЧЧ:ММ' });
  if (b.startLocalTime && b.startLocalTime === b.endLocalTime) e.push({ path: 'endLocalTime', code: 'EMPTY_SHIFT', message: 'Начало и конец смены совпадают' });
  if (typeof b.validFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.validFrom)) e.push({ path: 'validFrom', code: 'INVALID_DATE', message: 'Дата ГГГГ-ММ-ДД' });
  if (b.validTo != null && (typeof b.validTo !== 'string' || (typeof b.validFrom === 'string' && b.validTo < b.validFrom))) e.push({ path: 'validTo', code: 'INVALID_DATE', message: 'Окончание не раньше начала' });
  return e;
}

export const adminHandlers = [
  route('put', '/enterprises/:enterpriseId', async ({ params, request }) => {
    const e = db.enterprises.find((x) => x.id === params.enterpriseId);
    if (!e) return notFound('Предприятие');
    const b = await body(request);
    const errors = name(b);
    if (typeof b.timezone !== 'string' || !b.timezone) errors.push({ path: 'timezone', code: 'REQUIRED', message: 'Укажите часовой пояс' });
    if (errors.length) return invalid(errors);
    Object.assign(e, { name: b.name, timezone: b.timezone, updatedAt: now() });
    return HttpResponse.json(e);
  }),
  route('put', '/enterprises/:enterpriseId/status', async ({ params, request }) => {
    const e = db.enterprises.find((x) => x.id === params.enterpriseId);
    if (!e) return notFound('Предприятие');
    const status = parseStatus(await body(request));
    if (!status) return badStatus();
    if (status === 'DISABLED' && db.enterprises.filter((x) => x.status === 'ACTIVE').length <= 1) {
      return conflict('LAST_ENTERPRISE', 'Нельзя отключить последнее активное предприятие');
    }
    e.status = status;
    e.updatedAt = now();
    return HttpResponse.json(e);
  }),

  route('get', '/shifts/:shiftId', ({ params }) => {
    const s = db.shifts.find((x) => x.id === params.shiftId);
    return s ? HttpResponse.json(s) : notFound('Смена');
  }),
  route('post', '/enterprises/:enterpriseId/shifts', async ({ params, request }) => {
    if (!db.enterprises.some((e) => e.id === params.enterpriseId)) return notFound('Предприятие');
    const b = await body(request);
    const errors = [...code(b), ...shiftErrors(b)];
    if (errors.length) return invalid(errors);
    if (db.shifts.some((s) => s.enterpriseId === params.enterpriseId && s.code === b.code)) return conflict('DUPLICATE_CODE', 'Смена с таким кодом уже есть', 'code');
    const s: S['Shift'] = {
      id: crypto.randomUUID(),
      enterpriseId: params.enterpriseId as string,
      code: b.code as string,
      name: b.name as string,
      startLocalTime: b.startLocalTime as string,
      endLocalTime: b.endLocalTime as string,
      validFrom: b.validFrom as string,
      validTo: (b.validTo as string | null) ?? null,
      sortOrder: (b.sortOrder as number) ?? db.shifts.length + 1,
      status: 'ACTIVE',
      used: false,
      createdAt: now(),
      updatedAt: now(),
    };
    db.shifts.push(s);
    return HttpResponse.json(s, { status: 201 });
  }),
  route('put', '/shifts/:shiftId', async ({ params, request }) => {
    const s = db.shifts.find((x) => x.id === params.shiftId);
    if (!s) return notFound('Смена');
    const b = await body(request);
    const errors = shiftErrors(b);
    if (typeof b.sortOrder !== 'number' || b.sortOrder < 0) errors.push({ path: 'sortOrder', code: 'INVALID_VALUE', message: 'Порядок ≥ 0' });
    if (errors.length) return invalid(errors);
    if (s.used && (b.startLocalTime !== s.startLocalTime || b.endLocalTime !== s.endLocalTime || b.validFrom !== s.validFrom)) {
      return conflict('SHIFT_BOUNDARIES_LOCKED', 'Границы смены с историей изменить нельзя — создайте новую смену', 'startLocalTime');
    }
    Object.assign(s, { name: b.name, startLocalTime: b.startLocalTime, endLocalTime: b.endLocalTime, validFrom: b.validFrom, validTo: b.validTo ?? null, sortOrder: b.sortOrder, updatedAt: now() });
    return HttpResponse.json(s);
  }),
  route('put', '/shifts/:shiftId/status', async ({ params, request }) => {
    const s = db.shifts.find((x) => x.id === params.shiftId);
    if (!s) return notFound('Смена');
    const status = parseStatus(await body(request));
    if (!status) return badStatus();
    s.status = status;
    s.updatedAt = now();
    return HttpResponse.json(s);
  }),

  route('post', '/enterprises/:enterpriseId/loss-reasons', async ({ params, request }) => {
    if (!db.enterprises.some((e) => e.id === params.enterpriseId)) return notFound('Предприятие');
    const b = await body(request);
    const errors = [...code(b), ...name(b)];
    if (typeof b.category !== 'string') errors.push({ path: 'category', code: 'REQUIRED', message: 'Укажите категорию' });
    if (b.color != null && !/^#[0-9A-Fa-f]{6}$/.test(String(b.color))) errors.push({ path: 'color', code: 'INVALID_COLOR', message: 'Цвет #RRGGBB' });
    if (errors.length) return invalid(errors);
    if (db.reasons.some((r) => r.enterpriseId === params.enterpriseId && r.code === b.code)) return conflict('DUPLICATE_CODE', 'Причина с таким кодом уже есть', 'code');
    const r: S['LossReason'] = {
      id: crypto.randomUUID(),
      enterpriseId: params.enterpriseId as string,
      code: b.code as string,
      name: b.name as string,
      description: (b.description as string | null) ?? null,
      category: b.category as S['LossCategory'],
      color: (b.color as string | null) ?? null,
      status: 'ACTIVE',
      used: false,
      createdAt: now(),
      updatedAt: now(),
    };
    db.reasons.push(r);
    return HttpResponse.json(r, { status: 201 });
  }),
  route('put', '/loss-reasons/:lossReasonId', async ({ params, request }) => {
    const r = db.reason(params.lossReasonId as string);
    if (!r) return notFound('Причина потерь');
    const b = await body(request);
    const errors = name(b);
    if (typeof b.category !== 'string') errors.push({ path: 'category', code: 'REQUIRED', message: 'Укажите категорию' });
    if (b.color != null && !/^#[0-9A-Fa-f]{6}$/.test(String(b.color))) errors.push({ path: 'color', code: 'INVALID_COLOR', message: 'Цвет #RRGGBB' });
    if (errors.length) return invalid(errors);
    Object.assign(r, { name: b.name, description: b.description ?? null, category: b.category, color: b.color ?? null, updatedAt: now() });
    return HttpResponse.json(r);
  }),
  route('put', '/loss-reasons/:lossReasonId/status', async ({ params, request }) => {
    const r = db.reason(params.lossReasonId as string);
    if (!r) return notFound('Причина потерь');
    const status = parseStatus(await body(request));
    if (!status) return badStatus();
    r.status = status;
    r.updatedAt = now();
    return HttpResponse.json(r);
  }),

  route('put', '/lines/:lineId', async ({ params, request }) => {
    const l = db.lines.find((x) => x.id === params.lineId);
    if (!l) return notFound('Линия');
    const b = await body(request);
    const errors = name(b);
    if (typeof b.sortOrder !== 'number' || b.sortOrder < 0) errors.push({ path: 'sortOrder', code: 'INVALID_VALUE', message: 'Порядок ≥ 0' });
    if (errors.length) return invalid(errors);
    Object.assign(l, { name: b.name, sortOrder: b.sortOrder, updatedAt: now() });
    return HttpResponse.json(l);
  }),
  route('put', '/lines/:lineId/status', async ({ params, request }) => {
    const l = db.lines.find((x) => x.id === params.lineId);
    if (!l) return notFound('Линия');
    const status = parseStatus(await body(request));
    if (!status) return badStatus();
    if (status === 'DISABLED' && db.machines.some((m) => m.lineId === l.id && m.status === 'ACTIVE')) {
      return conflict('LINE_HAS_ACTIVE_MACHINES', 'На линии есть активные машины — сначала отключите или переназначьте их');
    }
    l.status = status;
    l.updatedAt = now();
    return HttpResponse.json(l);
  }),

  route('put', '/machines/:machineId', async ({ params, request }) => {
    const m = db.machine(params.machineId as string);
    if (!m) return notFound('Машина');
    const b = await body(request);
    const errors = name(b);
    if (!Array.isArray(b.parameters)) errors.push({ path: 'parameters', code: 'REQUIRED', message: 'parameters обязателен' });
    if (b.nominalRate != null && !(typeof b.nominalRate === 'number' && b.nominalRate > 0)) errors.push({ path: 'nominalRate', code: 'INVALID_VALUE', message: 'Норма выпуска должна быть больше 0' });
    if (b.commissioningYear != null && !(typeof b.commissioningYear === 'number' && b.commissioningYear >= 1900 && b.commissioningYear <= 9999)) errors.push({ path: 'commissioningYear', code: 'INVALID_VALUE', message: 'Год 1900–9999' });
    if (errors.length) return invalid(errors);
    for (const k of ['name', 'machineType', 'inventoryNo', 'manufacturer', 'model', 'commissioningYear', 'productionUnit', 'sortOrder', 'parameters'] as const) {
      (m as Record<string, unknown>)[k] = b[k] ?? null;
    }
    m.name = b.name as string;
    m.parameters = (b.parameters as S['TypedParameter'][]) ?? [];
    if (b.nominalRate != null) m.nominalRate = b.nominalRate as number;
    m.updatedAt = now();
    return HttpResponse.json(wireMachine(m));
  }),

  route('get', '/components/:componentId', ({ params }) => {
    for (const list of db.components.values()) {
      const c = list.find((x) => x.id === params.componentId);
      if (c) return HttpResponse.json(c);
    }
    return notFound('Компонент');
  }),
  route('put', '/components/:componentId', async ({ params, request }) => {
    const c = findComponent(params.componentId as string);
    if (!c) return notFound('Компонент');
    const b = await body(request);
    const errors = name(b);
    if (typeof b.kind !== 'string') errors.push({ path: 'kind', code: 'REQUIRED', message: 'Укажите вид' });
    if (errors.length) return invalid(errors);
    Object.assign(c, { name: b.name, kind: b.kind, sortOrder: b.sortOrder ?? c.sortOrder, parameters: b.parameters ?? c.parameters, updatedAt: now() });
    return HttpResponse.json(c);
  }),
  route('put', '/components/:componentId/parent', async ({ params, request }) => {
    const c = findComponent(params.componentId as string);
    if (!c) return notFound('Компонент');
    const parentId = ((await body(request)).parentComponentId as string | null) ?? null;
    if (parentId) {
      const siblings = db.components.get(c.machineId) ?? [];
      if (!siblings.some((x) => x.id === parentId)) return invalid([{ path: 'parentComponentId', code: 'NOT_FOUND', message: 'Родитель не найден у этой машины' }]);
      for (let cur: string | null = parentId; cur; cur = siblings.find((x) => x.id === cur)?.parentComponentId ?? null) {
        if (cur === c.id) return conflict('COMPONENT_CYCLE', 'Нельзя сделать компонент потомком самого себя');
      }
    }
    c.parentComponentId = parentId;
    c.updatedAt = now();
    return HttpResponse.json(c);
  }),
  route('put', '/components/:componentId/status', async ({ params, request }) => {
    const c = findComponent(params.componentId as string);
    if (!c) return notFound('Компонент');
    const status = parseStatus(await body(request));
    if (!status) return badStatus();
    c.status = status;
    c.updatedAt = now();
    return HttpResponse.json(c);
  }),

  route('get', '/telemetry-signals/:signalId', ({ params }) => {
    const s = findSignal(params.signalId as string);
    return s ? HttpResponse.json(s) : notFound('Сигнал');
  }),
  route('put', '/telemetry-signals/:signalId', async ({ params, request }) => {
    const s = findSignal(params.signalId as string);
    if (!s) return notFound('Сигнал');
    const b = await body(request);
    const errors = name(b);
    if (errors.length) return invalid(errors);
    const keys = ['name', 'description', 'semanticCode', 'customSemanticCode', 'unitCode', 'expectedIntervalMs', 'staleAfterMs', 'validMin', 'validMax', 'featured', 'displayOrder', 'componentId'] as const;
    const patch: Record<string, unknown> = { updatedAt: now() };
    for (const k of keys) if (k in b) patch[k] = b[k];
    patch.name = b.name;
    db.signalPatches.set(s.id, { ...db.signalPatches.get(s.id), ...patch });
    return HttpResponse.json(findSignal(s.id));
  }),
  route('put', '/telemetry-signals/:signalId/status', async ({ params, request }) => {
    const s = findSignal(params.signalId as string);
    if (!s) return notFound('Сигнал');
    const status = parseStatus(await body(request));
    if (!status) return badStatus();
    db.signalPatches.set(s.id, { ...db.signalPatches.get(s.id), status, updatedAt: now() });
    return HttpResponse.json(findSignal(s.id));
  }),
];

function findComponent(id: string) {
  for (const list of db.components.values()) {
    const c = list.find((x) => x.id === id);
    if (c) return c;
  }
  return undefined;
}

function findSignal(id: string) {
  for (const m of db.machines) {
    const s = db.signals(m).find((x) => x.id === id);
    if (s) return s;
  }
  return undefined;
}
