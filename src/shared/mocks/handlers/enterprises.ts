import { http, HttpResponse } from 'msw';
import { EnterpriseInputSchema, LineInputSchema } from '../../api/contract';
import { db } from '../db';
import { latency, newId, notFound, parseBody } from './utils';

export const enterpriseHandlers = [
  http.get('*/api/enterprises', async () => {
    await latency();
    return HttpResponse.json(db.enterprises);
  }),
  http.post('*/api/enterprises', async ({ request }) => {
    await latency();
    const { data, error } = await parseBody(request, EnterpriseInputSchema);
    if (error) return error;
    const e = { ...data, id: newId('ent') };
    db.enterprises.push(e);
    return HttpResponse.json(e, { status: 201 });
  }),
  http.get('*/api/enterprises/:id', async ({ params }) => {
    await latency();
    const e = db.enterprises.find((x) => x.id === params.id);
    return e ? HttpResponse.json(e) : notFound('Предприятие');
  }),
  http.put('*/api/enterprises/:id', async ({ params, request }) => {
    await latency();
    const i = db.enterprises.findIndex((x) => x.id === params.id);
    if (i < 0) return notFound('Предприятие');
    const { data, error } = await parseBody(request, EnterpriseInputSchema);
    if (error) return error;
    db.enterprises[i] = { ...data, id: db.enterprises[i].id };
    return HttpResponse.json(db.enterprises[i]);
  }),
  http.get('*/api/enterprises/:id/lines', async ({ params }) => {
    await latency();
    if (!db.enterprises.some((e) => e.id === params.id)) return notFound('Предприятие');
    return HttpResponse.json(db.lines.filter((l) => l.enterpriseId === params.id).sort((a, b) => a.order - b.order));
  }),
  http.post('*/api/enterprises/:id/lines', async ({ params, request }) => {
    await latency();
    if (!db.enterprises.some((e) => e.id === params.id)) return notFound('Предприятие');
    const { data, error } = await parseBody(request, LineInputSchema);
    if (error) return error;
    const line = { ...data, id: newId('line'), enterpriseId: params.id as string };
    db.lines.push(line);
    return HttpResponse.json(line, { status: 201 });
  }),
  http.get('*/api/lines/:id', async ({ params }) => {
    await latency();
    const line = db.lines.find((l) => l.id === params.id);
    return line ? HttpResponse.json(line) : notFound('Линия');
  }),
  http.put('*/api/lines/:id', async ({ params, request }) => {
    await latency();
    const i = db.lines.findIndex((x) => x.id === params.id);
    if (i < 0) return notFound('Линия');
    const { data, error } = await parseBody(request, LineInputSchema);
    if (error) return error;
    db.lines[i] = { ...db.lines[i], ...data };
    return HttpResponse.json(db.lines[i]);
  }),
];
