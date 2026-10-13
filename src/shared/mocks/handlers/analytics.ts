import { HttpResponse } from 'msw';
import type { components } from '../../api/generated/analytics';
import { STATE_CODES, type StateCode } from '../../config/states';
import * as calc from '../calc';
import { db } from '../db';
import { badRequest, notFound, query, route } from './utils';

type S = components['schemas'];
const SCOPES: S['AnalyticsScope'][] = ['MACHINE', 'LINE', 'ENTERPRISE'];
const RESOLUTIONS: S['Resolution'][] = ['AUTO', '5m', '15m', '1h', '1d'];

function scopeOf(request: Request): { ok: false; error: Response } | { ok: true; scope: S['AnalyticsScope']; scopeId: string } {
  const q = query(request);
  const scope = q.str('scope') as S['AnalyticsScope'];
  const scopeId = q.str('scopeId');
  if (!SCOPES.includes(scope) || !scopeId) return { ok: false, error: badRequest('scope и scopeId обязательны') };
  const exists =
    (scope === 'MACHINE' && db.machine(scopeId)) ||
    (scope === 'LINE' && db.lines.some((l) => l.id === scopeId)) ||
    (scope === 'ENTERPRISE' && db.enterprises.some((e) => e.id === scopeId));
  if (!exists) return { ok: false, error: notFound('Область') };
  return { ok: true, scope, scopeId };
}

function requiredRange(request: Request) {
  const q = query(request);
  const from = q.time('from');
  const to = q.time('to');
  if (from == null || to == null || Number.isNaN(from) || Number.isNaN(to) || to <= from) return null;
  return { from, to };
}

function resolution(request: Request) {
  const r = (query(request).str('resolution') ?? 'AUTO') as S['Resolution'];
  return RESOLUTIONS.includes(r) ? r : null;
}

export const analyticsHandlers = [
  route(
    'get',
    '/analytics/summary',
    ({ request }) => {
      const s = scopeOf(request);
      if (!s.ok) return s.error;
      const q = query(request);
      const range = calc.resolveRange({ from: q.time('from'), to: q.time('to'), shiftId: q.str('shiftId'), shiftDate: q.str('shiftDate') });
      if (!range || Number.isNaN(range.from) || Number.isNaN(range.to)) return badRequest('Нужны from+to или shiftId+shiftDate');
      const compare = (q.str('compare') ?? 'PREVIOUS_PERIOD') as 'NONE' | 'PREVIOUS_PERIOD';
      return HttpResponse.json(calc.summary(s.scope, s.scopeId, range, q.str('shiftId'), q.str('shiftDate'), compare, Date.now()));
    },
    { failable: true },
  ),
  route(
    'get',
    '/analytics/metrics/timeseries',
    ({ request }) => {
      const s = scopeOf(request);
      if (!s.ok) return s.error;
      const r = requiredRange(request);
      const res = resolution(request);
      if (!r || !res) return badRequest('Некорректные from/to/resolution');
      return HttpResponse.json(calc.metricTimeseries(s.scope, s.scopeId, r.from, r.to, query(request).str('shiftId'), res, Date.now()));
    },
    { failable: true },
  ),
  route(
    'get',
    '/analytics/losses/timeseries',
    ({ request }) => {
      const s = scopeOf(request);
      if (!s.ok) return s.error;
      const r = requiredRange(request);
      const res = resolution(request);
      if (!r || !res) return badRequest('Некорректные from/to/resolution');
      const q = query(request);
      return HttpResponse.json(calc.lossTimeseries(s.scope, s.scopeId, r.from, r.to, q.str('shiftId'), res, Math.min(20, q.int('top', 5)), Date.now()));
    },
    { failable: true },
  ),
  route(
    'get',
    '/analytics/losses/pareto',
    ({ request }) => {
      const s = scopeOf(request);
      if (!s.ok) return s.error;
      const q = query(request);
      const range = calc.resolveRange({ from: q.time('from'), to: q.time('to'), shiftId: q.str('shiftId'), shiftDate: q.str('shiftDate') });
      if (!range || Number.isNaN(range.from) || Number.isNaN(range.to)) return badRequest('Нужны from+to или shiftId+shiftDate');
      return HttpResponse.json(calc.lossPareto(s.scope, s.scopeId, range, q.str('shiftId'), q.str('shiftDate'), Math.min(20, q.int('top', 5)), Date.now()));
    },
    { failable: true },
  ),
  route(
    'get',
    '/machines/:machineId/telemetry/series',
    ({ params, request }) => {
      const m = db.machine(params.machineId as string);
      if (!m) return notFound('Машина');
      const r = requiredRange(request);
      const res = resolution(request);
      const signalId = query(request).str('signalId');
      if (!r || !res || !signalId) return badRequest('Нужны signalId, from, to');
      const series = calc.telemetrySeries(m, signalId, r.from, r.to, res, Date.now());
      return series ? HttpResponse.json(series) : notFound('Сигнал');
    },
    { failable: true },
  ),
  route(
    'get',
    '/machines/:machineId/chronometry',
    ({ params, request }) => {
      const m = db.machine(params.machineId as string);
      if (!m) return notFound('Машина');
      const q = query(request);
      const shiftDate = q.str('shiftDate');
      if (!shiftDate || !/^\d{4}-\d{2}-\d{2}$/.test(shiftDate)) return badRequest('shiftDate обязателен');
      return HttpResponse.json(calc.chronometry(m, shiftDate, q.str('shiftId'), Date.now()));
    },
    { failable: true },
  ),
  route(
    'get',
    '/machines/:machineId/state-intervals',
    ({ params, request }) => {
      const m = db.machine(params.machineId as string);
      if (!m) return notFound('Машина');
      const r = requiredRange(request);
      if (!r) return badRequest('Некорректные from/to');
      const q = query(request);
      const state = q.sp.getAll('state') as StateCode[];
      if (state.some((st) => !STATE_CODES.includes(st))) return badRequest('Неизвестное состояние');
      return HttpResponse.json(
        calc.stateIntervals(
          m,
          r.from,
          r.to,
          {
            state,
            lossReasonId: q.str('lossReasonId'),
            unclassifiedOnly: q.bool('unclassifiedOnly'),
            lossOnly: q.bool('lossOnly'),
            source: q.str('source') as S['StateSource'] | undefined,
          },
          q.str('cursor'),
          Math.min(500, Math.max(1, q.int('limit', 100))),
          Date.now(),
        ),
      );
    },
    { failable: true },
  ),
];
