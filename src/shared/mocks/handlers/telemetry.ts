import { http, HttpResponse } from 'msw';
import { HOUR, MINUTE, toIso } from '../../lib/time';
import { db } from '../db';
import { telemetryAt } from '../generate/telemetry';
import { badRequest, latency, mockError, notFound, query } from './utils';

export const telemetryHandlers = [
  http.get('*/api/analytics/machines/:id/telemetry/latest', async ({ params, request }) => {
    await latency();
    const err = mockError(request);
    if (err) return err;
    const m = db.machine(params.id as string);
    if (!m) return notFound('Машина');
    const now = Date.now();
    const intervals = db.intervals(m, now - 13 * HOUR, now, now);
    const values = Object.fromEntries(m.opcTags.map((t) => [t.signal, telemetryAt(m, t.signal, now, intervals)]));
    return HttpResponse.json({ machineId: m.id, ts: toIso(now, db.tz()), values });
  }),
  http.get('*/api/analytics/machines/:id/telemetry/series', async ({ params, request }) => {
    await latency();
    const err = mockError(request);
    if (err) return err;
    const m = db.machine(params.id as string);
    if (!m) return notFound('Машина');
    const { time, str } = query(request);
    const signal = str('signal');
    if (!signal) return badRequest('signal обязателен');
    const now = Date.now();
    const to = Math.min(time('to') ?? now, now);
    const from = time('from') ?? to - HOUR;
    const step = Math.max(MINUTE, Math.ceil((to - from) / 720 / MINUTE) * MINUTE);
    const intervals = db.intervals(m, from - 13 * HOUR, to, now);
    const points: [string, number][] = [];
    for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
      points.push([toIso(t, db.tz()), telemetryAt(m, signal, t, intervals)]);
    }
    return HttpResponse.json({ signal, points });
  }),
];
