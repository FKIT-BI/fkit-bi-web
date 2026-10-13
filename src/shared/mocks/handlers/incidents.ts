import { HttpResponse } from 'msw';
import type { components } from '../../api/generated/analytics';
import * as calc from '../calc';
import { db, type MockIncident } from '../db';
import { apiError, badRequest, notFound, query, route } from './utils';

type S = components['schemas'];

const idempotency = new Map<string, string>();
const CREATE_KEYS = ['from', 'to', 'stateOverride', 'lossReasonId', 'comment', 'author'];
const UPDATE_KEYS = ['from', 'to', 'stateOverride', 'lossReasonId', 'comment'];

function validate(body: Record<string, unknown>, allowed: string[], now: number) {
  const errors: Array<{ path: string; code: string; message: string }> = [];
  for (const k of Object.keys(body)) if (!allowed.includes(k)) errors.push({ path: k, code: 'UNKNOWN_FIELD', message: 'Поле не поддерживается' });
  const from = typeof body.from === 'string' ? Date.parse(body.from) : NaN;
  const to = body.to == null ? null : typeof body.to === 'string' ? Date.parse(body.to) : NaN;
  if (Number.isNaN(from)) errors.push({ path: 'from', code: 'REQUIRED', message: 'Укажите начало' });
  if (to != null && (Number.isNaN(to) || to <= from)) errors.push({ path: 'to', code: 'INVALID_RANGE', message: 'Конец должен быть позже начала' });
  if (from > now || (to ?? 0) > now + 60_000) errors.push({ path: 'from', code: 'IN_FUTURE', message: 'Время не может быть в будущем' });
  const override = (body.stateOverride ?? null) as S['ManualStateOverride'] | null;
  if (override && override !== 'SETUP' && override !== 'PLANNED_STOP') errors.push({ path: 'stateOverride', code: 'INVALID', message: 'Недопустимое состояние' });
  const reasonId = (body.lossReasonId ?? null) as string | null;
  if (!override && !reasonId) errors.push({ path: 'lossReasonId', code: 'REQUIRED', message: 'Укажите причину или состояние' });
  if (reasonId && db.reason(reasonId)?.status !== 'ACTIVE') errors.push({ path: 'lossReasonId', code: 'NOT_FOUND', message: 'Причина не найдена' });
  if (typeof body.comment === 'string' && body.comment.length > 500) errors.push({ path: 'comment', code: 'TOO_LONG', message: 'Не длиннее 500 символов' });
  if (typeof body.author === 'string' && body.author.length > 100) errors.push({ path: 'author', code: 'TOO_LONG', message: 'Не длиннее 100 символов' });
  return { errors, from, to, override, reasonId };
}

function list(request: Request, filter: (i: MockIncident) => boolean) {
  const q = query(request);
  const now = Date.now();
  const from = q.time('from');
  const to = q.time('to');
  if (Number.isNaN(from) || Number.isNaN(to)) return badRequest('from/to должны быть в ISO 8601');
  const effect = q.str('effectType');
  const items = db.incidents
    .filter(filter)
    .filter((i) => q.bool('includeCancelled') || !i.cancelledAt)
    .filter((i) => from == null || (i.to ?? now) > from)
    .filter((i) => to == null || i.from < to)
    .filter((i) => !q.str('lossReasonId') || i.lossReasonId === q.str('lossReasonId'))
    .filter((i) => q.str('ongoing') == null || (i.to == null) === q.bool('ongoing'))
    .map(calc.wireIncident)
    .filter((i) => !effect || i.effectType === effect)
    .sort((a, b) => Date.parse(b.from) - Date.parse(a.from));
  const limit = Math.min(500, Math.max(1, q.int('limit', 100)));
  const offset = q.str('cursor') ? Number(atob(q.str('cursor')!)) || 0 : 0;
  const hasMore = offset + limit < items.length;
  return HttpResponse.json({
    items: items.slice(offset, offset + limit),
    cursor: { limit, hasMore, nextCursor: hasMore ? btoa(String(offset + limit)) : null },
  });
}

export const incidentHandlers = [
  route('get', '/enterprises/:enterpriseId/incidents', ({ params, request }) => {
    if (!db.enterprises.some((e) => e.id === params.enterpriseId)) return notFound('Предприятие');
    const q = query(request);
    const machineId = q.str('machineId');
    const lineId = q.str('lineId');
    return list(request, (i) => {
      const m = db.machine(i.machineId);
      return m?.enterpriseId === params.enterpriseId && (!machineId || i.machineId === machineId) && (!lineId || m?.lineId === lineId);
    });
  }),
  route('get', '/machines/:machineId/incidents', ({ params, request }) => {
    if (!db.machine(params.machineId as string)) return notFound('Машина');
    return list(request, (i) => i.machineId === params.machineId);
  }),
  route('post', '/machines/:machineId/incidents', async ({ params, request }) => {
    const m = db.machine(params.machineId as string);
    if (!m) return notFound('Машина');
    const key = request.headers.get('Idempotency-Key');
    if (!key || key.length < 8 || key.length > 128) return badRequest('Нужен заголовок Idempotency-Key', [{ path: 'Idempotency-Key', code: 'REQUIRED', message: 'Обязательный заголовок' }]);
    const known = idempotency.get(key);
    if (known) {
      const inc = db.incidents.find((i) => i.id === known);
      if (inc) return HttpResponse.json(calc.wireIncident(inc), { status: 201 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const now = Date.now();
    const v = validate(body, CREATE_KEYS, now);
    if (v.errors.length) return badRequest('Request body is invalid', v.errors);
    const inc: MockIncident = {
      id: crypto.randomUUID(),
      machineId: m.id,
      from: v.from,
      to: v.to,
      stateOverride: v.override,
      lossReasonId: v.reasonId,
      comment: (body.comment as string | null) ?? null,
      author: (body.author as string | null) ?? null,
      createdAt: now,
      updatedAt: now,
      cancelledAt: null,
    };
    db.incidents.push(inc);
    idempotency.set(key, inc.id);
    db.persist();
    return HttpResponse.json(calc.wireIncident(inc), { status: 201 });
  }),
  route('get', '/incidents/:incidentId', ({ params }) => {
    const inc = db.incidents.find((i) => i.id === params.incidentId);
    return inc ? HttpResponse.json(calc.wireIncident(inc)) : notFound('Инцидент');
  }),
  route('put', '/incidents/:incidentId', async ({ params, request }) => {
    const inc = db.incidents.find((i) => i.id === params.incidentId);
    if (!inc) return notFound('Инцидент');
    if (inc.cancelledAt) return apiError(409, 'INCIDENT_CANCELLED', 'Инцидент отменён');
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const v = validate(body, UPDATE_KEYS, Date.now());
    if (v.errors.length) return badRequest('Request body is invalid', v.errors);
    Object.assign(inc, {
      from: v.from,
      to: v.to,
      stateOverride: v.override,
      lossReasonId: v.reasonId,
      comment: (body.comment as string | null) ?? null,
      updatedAt: Date.now(),
    });
    db.persist();
    return HttpResponse.json(calc.wireIncident(inc));
  }),
  route('put', '/incidents/:incidentId/close', async ({ params, request }) => {
    const inc = db.incidents.find((i) => i.id === params.incidentId);
    if (!inc) return notFound('Инцидент');
    if (inc.cancelledAt) return apiError(409, 'INCIDENT_CANCELLED', 'Инцидент отменён');
    if (inc.to != null) return apiError(409, 'INCIDENT_CLOSED', 'Инцидент уже закрыт');
    const body = (await request.json().catch(() => ({}))) as { to?: string };
    const to = body.to ? Date.parse(body.to) : NaN;
    if (Number.isNaN(to) || to <= inc.from) return badRequest('Некорректный конец', [{ path: 'to', code: 'INVALID_RANGE', message: 'Конец должен быть позже начала' }]);
    inc.to = to;
    inc.updatedAt = Date.now();
    db.persist();
    return HttpResponse.json(calc.wireIncident(inc));
  }),
  route('delete', '/incidents/:incidentId', ({ params }) => {
    const inc = db.incidents.find((i) => i.id === params.incidentId);
    if (!inc) return notFound('Инцидент');
    inc.cancelledAt = Date.now();
    db.persist();
    return new HttpResponse(null, { status: 204 });
  }),
];
