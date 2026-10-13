import { http, HttpResponse } from 'msw';
import type { Bucket } from '../../lib/period';
import type { ShiftFilter } from '../../lib/shifts';
import * as calc from '../calc';
import { db } from '../db';
import { badRequest, latency, mockError, notFound, query } from './utils';

type Scope = 'enterprise' | 'line' | 'machine';

function rangeOf(request: Request) {
  const { time, str } = query(request);
  const now = Date.now();
  const from = time('from');
  const to = time('to');
  if (from == null || to == null || to <= from) return null;
  return {
    now,
    from,
    to,
    shift: (str('shift') ?? 'all') as ShiftFilter,
    scope: (str('scope') ?? 'machine') as Scope,
    id: str('id') ?? '',
  };
}

export const analyticsHandlers = [
  http.get('*/api/analytics/analytics/summary', async ({ request }) => {
    await latency();
    const err = mockError(request);
    if (err) return err;
    const r = rangeOf(request);
    if (!r) return badRequest('from/to обязательны');
    return HttpResponse.json(calc.summary(r.scope, r.id, r.from, r.to, r.shift, r.now));
  }),
  http.get('*/api/analytics/analytics/current-states', async ({ request }) => {
    await latency();
    const err = mockError(request);
    if (err) return err;
    const id = query(request).str('enterpriseId');
    if (!id) return badRequest('enterpriseId обязателен');
    if (!db.enterprises.some((e) => e.id === id)) return notFound('Предприятие');
    const now = Date.now();
    return HttpResponse.json(db.machinesOf('enterprise', id).map((m) => calc.currentState(m, now)));
  }),
  http.get('*/api/analytics/analytics/losses/timeseries', async ({ request }) => {
    await latency();
    const err = mockError(request);
    if (err) return err;
    const r = rangeOf(request);
    if (!r) return badRequest('from/to обязательны');
    const bucket = (query(request).str('bucket') ?? 'hour') as Bucket;
    return HttpResponse.json(calc.lossesTimeseries(r.scope, r.id, r.from, r.to, r.shift, bucket, r.now));
  }),
  http.get('*/api/analytics/analytics/losses/pareto', async ({ request }) => {
    await latency();
    const err = mockError(request);
    if (err) return err;
    const r = rangeOf(request);
    if (!r) return badRequest('from/to обязательны');
    const top = Number(query(request).str('top')) || undefined;
    return HttpResponse.json(calc.lossesPareto(r.scope, r.id, r.from, r.to, r.shift, top, r.now));
  }),
  http.get('*/api/analytics/analytics/chronometry', async ({ request }) => {
    await latency();
    const err = mockError(request);
    if (err) return err;
    const { str } = query(request);
    const m = db.machine(str('machineId') ?? '');
    if (!m) return notFound('Машина');
    const date = str('date');
    const shift = str('shift');
    if (!date || (shift !== 'day' && shift !== 'night')) return badRequest('date и shift=day|night обязательны');
    return HttpResponse.json(calc.chronometry(m, date, shift, Number(str('top')) || 5, Date.now()));
  }),
];
