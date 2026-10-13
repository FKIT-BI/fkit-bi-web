import { http, HttpResponse } from 'msw';
import { db } from '../db';
import type { MockMachine } from '../fixtures';
import { LossReasonInputSchema, MachineInputSchema } from '../../api/contract';
import { badRequest, latency, mockError, newId, notFound, parseBody, query } from './utils';
import { toIso } from '../../lib/time';

const toWire = ({ profile: _p, ...m }: MockMachine) => m;

export const machineHandlers = [
  http.get('*/api/lines/:id/machines', async ({ params }) => {
    await latency();
    return HttpResponse.json(
      db.machines.filter((m) => m.lineId === params.id && !m.archived).sort((a, b) => a.order - b.order).map(toWire),
    );
  }),
  http.get('*/api/machines/:id', async ({ params }) => {
    await latency();
    const m = db.machine(params.id as string);
    return m ? HttpResponse.json(toWire(m)) : notFound('Машина');
  }),
  http.post('*/api/lines/:id/machines', async ({ params, request }) => {
    await latency();
    if (!db.lines.some((l) => l.id === params.id)) return notFound('Линия');
    const { data, error } = await parseBody(request, MachineInputSchema);
    if (error) return error;
    const m: MockMachine = { ...data, lineId: params.id as string, id: newId('m'), profile: 'average' };
    db.machines.push(m);
    return HttpResponse.json(toWire(m), { status: 201 });
  }),
  http.put('*/api/machines/:id', async ({ params, request }) => {
    await latency();
    const m = db.machine(params.id as string);
    if (!m) return notFound('Машина');
    const { data, error } = await parseBody(request, MachineInputSchema);
    if (error) return error;
    if (!db.lines.some((l) => l.id === data.lineId)) return badRequest('Линия не найдена');
    Object.assign(m, data);
    return HttpResponse.json(toWire(m));
  }),
  http.get('*/api/loss-reasons', async () => {
    await latency();
    return HttpResponse.json(db.reasons);
  }),
  http.post('*/api/loss-reasons', async ({ request }) => {
    await latency();
    const { data, error } = await parseBody(request, LossReasonInputSchema);
    if (error) return error;
    const r = { ...data, id: newId('r') };
    db.reasons.push(r);
    return HttpResponse.json(r, { status: 201 });
  }),
  http.put('*/api/loss-reasons/:id', async ({ params, request }) => {
    await latency();
    const i = db.reasons.findIndex((r) => r.id === params.id);
    if (i < 0) return notFound('Причина');
    const { data, error } = await parseBody(request, LossReasonInputSchema);
    if (error) return error;
    db.reasons[i] = { ...data, id: db.reasons[i].id };
    return HttpResponse.json(db.reasons[i]);
  }),
  http.get('*/api/machines/:id/intervals', async ({ params, request }) => {
    await latency();
    const err = mockError(request);
    if (err) return err;
    const m = db.machine(params.id as string);
    if (!m) return notFound('Машина');
    const { time } = query(request);
    const now = Date.now();
    const tz = db.tz();
    const list = db.intervals(m, time('from') ?? now - 86_400_000, time('to') ?? now, now);
    return HttpResponse.json(
      list.map((i) => ({
        machineId: i.machineId,
        stateCode: i.stateCode,
        from: toIso(i.from, tz),
        to: i.to == null ? null : toIso(i.to, tz),
        reasonId: i.reasonId,
        incident: i.incident ?? null,
      })),
    );
  }),
];
