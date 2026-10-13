import { HttpResponse } from 'msw';
import * as calc from '../calc';
import { db } from '../db';
import { notFound, query, route } from './utils';

export const operationsHandlers = [
  route(
    'get',
    '/enterprises/:enterpriseId/operations/overview',
    ({ params, request }) => {
      if (!db.enterprises.some((e) => e.id === params.enterpriseId)) return notFound('Предприятие');
      return HttpResponse.json(calc.overview(params.enterpriseId as string, query(request).str('lineId'), Date.now()));
    },
    { failable: true },
  ),
  route(
    'get',
    '/machines/:machineId/operations/current',
    ({ params }) => {
      const m = db.machine(params.machineId as string);
      if (!m) return notFound('Машина');
      const now = Date.now();
      return HttpResponse.json({
        machine: calc.wireMachine(m),
        line: db.lines.find((l) => l.id === m.lineId) ?? null,
        currentState: calc.currentState(m, now),
        featuredSignals: calc.telemetryCurrent(m, now, { featuredOnly: true }).items,
        currency: calc.currency(now),
      });
    },
    { failable: true },
  ),
  route(
    'get',
    '/machines/:machineId/current-state',
    ({ params }) => {
      const m = db.machine(params.machineId as string);
      if (!m) return notFound('Машина');
      const cs = calc.currentState(m, Date.now());
      return cs ? HttpResponse.json(cs) : notFound('Текущее состояние');
    },
    { failable: true },
  ),
  route(
    'get',
    '/machines/:machineId/telemetry/current',
    ({ params, request }) => {
      const m = db.machine(params.machineId as string);
      if (!m) return notFound('Машина');
      const q = query(request);
      return HttpResponse.json(calc.telemetryCurrent(m, Date.now(), { signalId: q.sp.getAll('signalId'), featuredOnly: q.bool('featuredOnly') }));
    },
    { failable: true },
  ),
];
