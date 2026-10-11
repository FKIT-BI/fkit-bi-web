import { http, HttpResponse } from 'msw';
import { toIso } from '../../lib/time';
import { db, type MockIncident } from '../db';
import { IncidentInputSchema } from '../../api/contract';
import { badRequest, latency, newId, notFound, parseBody, query } from './utils';

const wire = (i: MockIncident) => {
  const tz = db.tz();
  return { ...i, from: toIso(i.from, tz), to: i.to == null ? null : toIso(i.to, tz), createdAt: toIso(i.createdAt, tz) };
};

interface IncidentBody {
  machineId: string;
  from: string;
  to: string | null;
  reasonId: string;
  comment: string;
  author: string;
}

function validate(b: IncidentBody) {
  const from = Date.parse(b.from);
  const to = b.to ? Date.parse(b.to) : null;
  if (!db.machine(b.machineId)) return 'Машина не найдена';
  if (!db.reasons.some((r) => r.id === b.reasonId)) return 'Причина не найдена';
  if (Number.isNaN(from)) return 'Некорректное начало';
  if (to != null && to <= from) return 'Конец должен быть позже начала';
  if (from > Date.now() || (to ?? 0) > Date.now() + 60_000) return 'Время не может быть в будущем';
  if ((b.comment ?? '').length > 500) return 'Комментарий длиннее 500 символов';
  return null;
}

export const incidentHandlers = [
  http.get('*/api/incidents', async ({ request }) => {
    await latency();
    const { time, str } = query(request);
    const machineId = str('machineId');
    const from = time('from');
    const to = time('to');
    if (Number.isNaN(from) || Number.isNaN(to)) return badRequest('from/to должны быть в ISO 8601');
    const now = Date.now();
    const list = db.incidents
      .filter((i) => !machineId || i.machineId === machineId)
      .filter((i) => from == null || (i.to ?? now) > from)
      .filter((i) => to == null || i.from < to)
      .sort((a, b) => b.from - a.from);
    return HttpResponse.json(list.map(wire));
  }),
  http.post('*/api/incidents', async ({ request }) => {
    await latency();
    const { data: body, error: bodyError } = await parseBody(request, IncidentInputSchema);
    if (bodyError) return bodyError;
    const error = validate(body);
    if (error) return badRequest(error);
    const inc: MockIncident = {
      id: newId('inc'),
      machineId: body.machineId,
      from: Date.parse(body.from),
      to: body.to ? Date.parse(body.to) : null,
      reasonId: body.reasonId,
      comment: body.comment ?? '',
      author: body.author,
      createdAt: Date.now(),
    };
    db.incidents.push(inc);
    db.persist();
    return HttpResponse.json(wire(inc), { status: 201 });
  }),
  http.get('*/api/incidents/:id', async ({ params }) => {
    await latency();
    const inc = db.incidents.find((i) => i.id === params.id);
    return inc ? HttpResponse.json(wire(inc)) : notFound('Инцидент');
  }),
  http.put('*/api/incidents/:id', async ({ params, request }) => {
    await latency();
    const inc = db.incidents.find((i) => i.id === params.id);
    if (!inc) return notFound('Инцидент');
    const { data: body, error: bodyError } = await parseBody(request, IncidentInputSchema);
    if (bodyError) return bodyError;
    const error = validate(body);
    if (error) return badRequest(error);
    Object.assign(inc, {
      from: Date.parse(body.from),
      to: body.to ? Date.parse(body.to) : null,
      reasonId: body.reasonId,
      comment: body.comment,
    });
    db.persist();
    return HttpResponse.json(wire(inc));
  }),
  http.delete('*/api/incidents/:id', async ({ params }) => {
    await latency();
    if (!db.incidents.some((i) => i.id === params.id)) return notFound('Инцидент');
    db.incidents = db.incidents.filter((i) => i.id !== params.id);
    db.persist();
    return new HttpResponse(null, { status: 204 });
  }),
];
