import { HttpResponse } from 'msw';
import { toIso } from '../../lib/time';
import { wireMachine } from '../calc';
import { db } from '../db';
import { byStatus, notFound, page, query, route } from './utils';

const search = (request: Request) => (query(request).str('search') ?? '').toLowerCase();
const matches = (request: Request, ...fields: Array<string | null | undefined>) =>
  !search(request) || fields.some((f) => f?.toLowerCase().includes(search(request)));

export const configHandlers = [
  route('get', '/reference/measurement-units', () =>
    HttpResponse.json([
      { code: 'PCS', name: 'Штука', symbol: 'шт', quantityCode: 'COUNT' },
      { code: 'METER', name: 'Метр', symbol: 'м', quantityCode: 'LENGTH' },
      { code: 'KILOGRAM', name: 'Килограмм', symbol: 'кг', quantityCode: 'MASS' },
      { code: 'LITER', name: 'Литр', symbol: 'л', quantityCode: 'VOLUME' },
      { code: 'CELSIUS', name: 'Градус Цельсия', symbol: '°C', quantityCode: 'TEMPERATURE' },
      { code: 'PERCENT', name: 'Процент', symbol: '%', quantityCode: 'RATIO' },
      { code: 'RPM', name: 'Обороты в минуту', symbol: 'об/мин', quantityCode: 'ROTATIONAL_SPEED' },
      { code: 'BAR', name: 'Бар', symbol: 'бар', quantityCode: 'PRESSURE' },
    ]),
  ),
  route('get', '/enterprises', ({ request }) =>
    HttpResponse.json(page(byStatus(db.enterprises, request).filter((e) => matches(request, e.name, e.code)), request)),
  ),
  route('get', '/enterprises/:enterpriseId', ({ params }) => {
    const e = db.enterprises.find((x) => x.id === params.enterpriseId);
    return e ? HttpResponse.json(e) : notFound('Предприятие');
  }),
  route('get', '/enterprises/:enterpriseId/shifts', ({ params, request }) => {
    if (!db.enterprises.some((e) => e.id === params.enterpriseId)) return notFound('Предприятие');
    const list = byStatus(db.shifts, request).filter((s) => s.enterpriseId === params.enterpriseId);
    return HttpResponse.json(page(list.sort((a, b) => a.sortOrder - b.sortOrder), request));
  }),
  route('get', '/enterprises/:enterpriseId/loss-reasons', ({ params, request }) => {
    if (!db.enterprises.some((e) => e.id === params.enterpriseId)) return notFound('Предприятие');
    const category = query(request).str('category');
    const list = byStatus(db.reasons, request)
      .filter((r) => r.enterpriseId === params.enterpriseId && (!category || r.category === category))
      .filter((r) => matches(request, r.name, r.code));
    return HttpResponse.json(page(list, request));
  }),
  route('get', '/loss-reasons/:lossReasonId', ({ params }) => {
    const r = db.reason(params.lossReasonId as string);
    return r ? HttpResponse.json(r) : notFound('Причина потерь');
  }),
  route('get', '/enterprises/:enterpriseId/lines', ({ params, request }) => {
    if (!db.enterprises.some((e) => e.id === params.enterpriseId)) return notFound('Предприятие');
    const list = byStatus(db.lines, request)
      .filter((l) => l.enterpriseId === params.enterpriseId && matches(request, l.name, l.code))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return HttpResponse.json(page(list, request));
  }),
  route('get', '/lines/:lineId', ({ params }) => {
    const l = db.lines.find((x) => x.id === params.lineId);
    return l ? HttpResponse.json(l) : notFound('Линия');
  }),
  route('get', '/lines/:lineId/machines', ({ params, request }) => {
    if (!db.lines.some((l) => l.id === params.lineId)) return notFound('Линия');
    const list = byStatus(db.machines, request)
      .filter((m) => m.lineId === params.lineId && matches(request, m.name, m.code, m.inventoryNo))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return HttpResponse.json(page(list.map(wireMachine), request));
  }),
  route('get', '/enterprises/:enterpriseId/machines', ({ params, request }) => {
    if (!db.enterprises.some((e) => e.id === params.enterpriseId)) return notFound('Предприятие');
    const lineId = query(request).str('lineId');
    const assignment = query(request).str('assignment') ?? 'ALL';
    const list = byStatus(db.machines, request)
      .filter((m) => m.enterpriseId === params.enterpriseId && (!lineId || m.lineId === lineId) && matches(request, m.name, m.code, m.inventoryNo))
      .filter((m) => assignment === 'ALL' || (assignment === 'ASSIGNED' ? !!m.lineId : !m.lineId));
    return HttpResponse.json(page(list.map(wireMachine), request));
  }),
  route('get', '/machines/:machineId', ({ params }) => {
    const m = db.machine(params.machineId as string);
    return m ? HttpResponse.json(wireMachine(m)) : notFound('Машина');
  }),
  route('get', '/machines/:machineId/telemetry-signals', ({ params, request }) => {
    const m = db.machine(params.machineId as string);
    if (!m) return notFound('Машина');
    const q = query(request);
    const list = byStatus(db.signals(m), request)
      .filter((s) => !q.str('semanticCode') || s.semanticCode === q.str('semanticCode'))
      .filter((s) => !q.str('signalKind') || s.signalKind === q.str('signalKind'))
      .filter((s) => q.str('featured') == null || String(s.featured) === q.str('featured'));
    return HttpResponse.json(page(list, request));
  }),
  route('get', '/enterprises/:enterpriseId/equipment-tree', ({ params, request }) => {
    const e = db.enterprises.find((x) => x.id === params.enterpriseId);
    if (!e) return notFound('Предприятие');
    const status = query(request).str('status') ?? 'ACTIVE';
    const toNode = (m: (typeof db.machines)[number]) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      inventoryNo: m.inventoryNo ?? null,
      machineType: m.machineType ?? null,
      sortOrder: m.sortOrder ?? null,
      status: m.status,
    });
    const machines = db.machines.filter((m) => m.enterpriseId === e.id && m.status === status && matches(request, m.name, m.code));
    return HttpResponse.json({
      enterprise: { id: e.id, code: e.code, name: e.name, timezone: e.timezone, status: e.status },
      lines: db.lines
        .filter((l) => l.enterpriseId === e.id && l.status === status)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((l) => ({
          id: l.id,
          code: l.code,
          name: l.name,
          sortOrder: l.sortOrder,
          status: l.status,
          machines: machines.filter((m) => m.lineId === l.id).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(toNode),
        })),
      unassignedMachines: machines.filter((m) => !m.lineId).map(toNode),
      generatedAt: toIso(Date.now(), db.tz()),
    });
  }),
];
