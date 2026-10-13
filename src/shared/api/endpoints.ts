import { queryOptions } from '@tanstack/react-query';
import { toIso } from '../lib/time';
import { analyticsClient as A, unwrap } from './client';
import type {
  ComponentUpdate,
  EnterpriseUpdate,
  LossReasonCreate,
  LossReasonUpdate,
  MachineUpdate,
  ProductionLineUpdate,
  ShiftCreate,
  ShiftUpdate,
  TelemetrySignalUpdate,
  UserCreate,
  ComponentCreate,
  ConfigStatus,
  EnterpriseCreate,
  MachineCreate,
  MachineStateConfigurationInput,
  ProductionLineCreate,
  TelemetrySignalCreate,
  AnalyticsScope,
  EffectiveStateInterval,
  LoginRequest,
  ManualIncident,
  ManualIncidentCreate,
  MachineState,
  Resolution,
} from './types';

export interface RangeParams {
  from: number;
  to: number;
  shiftId?: string;
  asOf?: number;
}

export const qk = {
  config: ['config'] as const,
  operations: ['operations'] as const,
  analytics: ['analytics'] as const,
  intervals: ['intervals'] as const,
  incidents: ['incidents'] as const,
  telemetry: ['telemetry'] as const,
};

const range = (p: RangeParams) => ({ from: toIso(p.from), to: toIso(p.to), ...(p.shiftId ? { shiftId: p.shiftId } : {}) });

export interface IntervalFilters {
  state?: MachineState[];
  lossReasonId?: string;
  unclassifiedOnly?: boolean;
  lossOnly?: boolean;
}

async function allIntervals(machineId: string, p: RangeParams, f: IntervalFilters, signal: AbortSignal, maxPages = 10) {
  const items: EffectiveStateInterval[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await unwrap(
      A.GET('/machines/{machineId}/state-intervals', {
        params: { path: { machineId }, query: { from: toIso(p.from), to: toIso(p.to), limit: 500, cursor, ...f } },
        signal,
      }),
    );
    items.push(...page.items);
    if (!page.cursor.hasMore || !page.cursor.nextCursor) return { items, truncated: false };
    cursor = page.cursor.nextCursor;
  }
  return { items, truncated: true };
}

export async function allCursorItems<T>(load: (cursor?: string) => Promise<{ items: T[]; cursor: { hasMore: boolean; nextCursor?: string | null } }>) {
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (;;) {
    const page = await load(cursor);
    items.push(...page.items);
    if (!page.cursor.hasMore || !page.cursor.nextCursor) return items;
    if (seen.has(page.cursor.nextCursor)) throw new Error('Сервис вернул повторяющийся cursor');
    seen.add(page.cursor.nextCursor);
    cursor = page.cursor.nextCursor;
  }
}

export const api = {
  login: (body: LoginRequest) => unwrap(A.POST('/auth/login', { body })),

  enterprises: () =>
    queryOptions({
      queryKey: [...qk.config, 'enterprises'],
      queryFn: ({ signal }) => unwrap(A.GET('/enterprises', { params: { query: { size: 200 } }, signal })),
      staleTime: Infinity,
    }),
  equipmentTree: (enterpriseId: string) =>
    queryOptions({
      queryKey: [...qk.config, 'equipment-tree', enterpriseId],
      queryFn: ({ signal }) => unwrap(A.GET('/enterprises/{enterpriseId}/equipment-tree', { params: { path: { enterpriseId } }, signal })),
      staleTime: 5 * 60_000,
    }),
  shifts: (enterpriseId: string) =>
    queryOptions({
      queryKey: [...qk.config, 'shifts', enterpriseId],
      queryFn: ({ signal }) =>
        unwrap(A.GET('/enterprises/{enterpriseId}/shifts', { params: { path: { enterpriseId }, query: { size: 200 } }, signal })),
      staleTime: Infinity,
    }),
  lossReasons: (enterpriseId: string) =>
    queryOptions({
      queryKey: [...qk.config, 'loss-reasons', enterpriseId],
      queryFn: ({ signal }) =>
        unwrap(A.GET('/enterprises/{enterpriseId}/loss-reasons', { params: { path: { enterpriseId }, query: { size: 200 } }, signal })),
      staleTime: Infinity,
    }),
  machine: (machineId: string) =>
    queryOptions({
      queryKey: [...qk.config, 'machine', machineId],
      queryFn: ({ signal }) => unwrap(A.GET('/machines/{machineId}', { params: { path: { machineId } }, signal })),
      staleTime: 5 * 60_000,
    }),

  overview: (enterpriseId: string, now: number) =>
    queryOptions({
      queryKey: [...qk.operations, 'overview', enterpriseId, now],
      queryFn: ({ signal }) =>
        unwrap(A.GET('/enterprises/{enterpriseId}/operations/overview', { params: { path: { enterpriseId } }, signal })),
    }),
  machineCurrent: (machineId: string, now: number) =>
    queryOptions({
      queryKey: [...qk.operations, 'machine', machineId, now],
      queryFn: ({ signal }) => unwrap(A.GET('/machines/{machineId}/operations/current', { params: { path: { machineId } }, signal })),
    }),
  telemetrySeries: (machineId: string, signalId: string, p: { from: number; to: number; resolution?: Resolution }) =>
    queryOptions({
      queryKey: [...qk.telemetry, 'series', machineId, signalId, p],
      queryFn: ({ signal }) =>
        unwrap(
          A.GET('/machines/{machineId}/telemetry/series', {
            params: { path: { machineId }, query: { signalId, from: toIso(p.from), to: toIso(p.to), resolution: p.resolution } },
            signal,
          }),
        ),
    }),

  summary: (scope: AnalyticsScope, scopeId: string, p: RangeParams) =>
    queryOptions({
      queryKey: [...qk.analytics, 'summary', scope, scopeId, p],
      queryFn: ({ signal }) => unwrap(A.GET('/analytics/summary', { params: { query: { scope, scopeId, ...range(p) } }, signal })),
    }),
  lossTimeseries: (scope: AnalyticsScope, scopeId: string, p: RangeParams & { resolution?: Resolution; top?: number }) =>
    queryOptions({
      queryKey: [...qk.analytics, 'losses', scope, scopeId, p],
      queryFn: ({ signal }) =>
        unwrap(
          A.GET('/analytics/losses/timeseries', {
            params: { query: { scope, scopeId, ...range(p), resolution: p.resolution, top: p.top } },
            signal,
          }),
        ),
    }),
  lossPareto: (scope: AnalyticsScope, scopeId: string, p: RangeParams & { top?: number }) =>
    queryOptions({
      queryKey: [...qk.analytics, 'pareto', scope, scopeId, p],
      queryFn: ({ signal }) => unwrap(A.GET('/analytics/losses/pareto', { params: { query: { scope, scopeId, ...range(p), top: p.top } }, signal })),
    }),
  chronometry: (machineId: string, shiftDate: string, now: number) =>
    queryOptions({
      queryKey: [...qk.analytics, 'chronometry', machineId, shiftDate, now],
      queryFn: ({ signal }) =>
        unwrap(A.GET('/machines/{machineId}/chronometry', { params: { path: { machineId }, query: { shiftDate } }, signal })),
    }),
  stateIntervals: (machineId: string, p: RangeParams, f: IntervalFilters = {}) =>
    queryOptions({
      queryKey: [...qk.intervals, machineId, p, f],
      queryFn: ({ signal }) => allIntervals(machineId, p, f, signal),
    }),

  machineIncidents: (machineId: string, p: { from: number; to: number }) =>
    queryOptions({
      queryKey: [...qk.incidents, 'machine', machineId, p],
      queryFn: ({ signal }) =>
        allCursorItems((cursor) =>
          unwrap(
            A.GET('/machines/{machineId}/incidents', {
              params: { path: { machineId }, query: { from: toIso(p.from), to: toIso(p.to), limit: 500, cursor } },
              signal,
            }),
          ),
        ),
    }),
  enterpriseIncidents: (enterpriseId: string, p: { from: number; to: number; machineId?: string; ongoing?: boolean }) =>
    queryOptions({
      queryKey: [...qk.incidents, 'enterprise', enterpriseId, p],
      queryFn: ({ signal }) =>
        allCursorItems((cursor) =>
          unwrap(
            A.GET('/enterprises/{enterpriseId}/incidents', {
              params: {
                path: { enterpriseId },
                query: { from: toIso(p.from), to: toIso(p.to), machineId: p.machineId, ongoing: p.ongoing, limit: 500, cursor },
              },
              signal,
            }),
          ),
        ),
    }),
  createIncident: (machineId: string, body: ManualIncidentCreate, idempotencyKey: string) =>
    unwrap(
      A.POST('/machines/{machineId}/incidents', {
        params: { path: { machineId }, header: { 'Idempotency-Key': idempotencyKey } },
        body,
      }),
    ),
  closeIncident: (incidentId: string, to: number) =>
    unwrap(A.PUT('/incidents/{incidentId}/close', { params: { path: { incidentId } }, body: { to: toIso(to) } })),
  cancelIncident: (incidentId: string) =>
    unwrap(A.DELETE('/incidents/{incidentId}', { params: { path: { incidentId } } })),
};

const allPages = async <T>(load: (page: number) => Promise<{ items: T[]; page: { totalPages: number } }>) => {
  const first = await load(0);
  const rest = await Promise.all(Array.from({ length: Math.max(0, first.page.totalPages - 1) }, (_, i) => load(i + 1)));
  return [first, ...rest].flatMap((p) => p.items);
};

const byStatuses = async <T>(load: (status: ConfigStatus) => Promise<T[]>) => {
  const [active, disabled] = await Promise.all([load('ACTIVE'), load('DISABLED')]);
  return [...active, ...disabled];
};

export const setup = {
  measurementUnits: () => unwrap(A.GET('/reference/measurement-units')),
  enterprises: () => allPages((page) => unwrap(A.GET('/enterprises', { params: { query: { page, size: 200 } } }))),
  allEnterprises: () =>
    byStatuses((status) => allPages((page) => unwrap(A.GET('/enterprises', { params: { query: { status, page, size: 200 } } })))),
  updateEnterprise: (enterpriseId: string, body: EnterpriseUpdate) =>
    unwrap(A.PUT('/enterprises/{enterpriseId}', { params: { path: { enterpriseId } }, body })),
  setEnterpriseStatus: (enterpriseId: string, status: ConfigStatus) =>
    unwrap(A.PUT('/enterprises/{enterpriseId}/status', { params: { path: { enterpriseId } }, body: { status } })),

  shifts: (enterpriseId: string) =>
    byStatuses((status) =>
      allPages((page) => unwrap(A.GET('/enterprises/{enterpriseId}/shifts', { params: { path: { enterpriseId }, query: { status, page, size: 200 } } }))),
    ),
  createShift: (enterpriseId: string, body: ShiftCreate) =>
    unwrap(A.POST('/enterprises/{enterpriseId}/shifts', { params: { path: { enterpriseId } }, body })),
  updateShift: (shiftId: string, body: ShiftUpdate) => unwrap(A.PUT('/shifts/{shiftId}', { params: { path: { shiftId } }, body })),
  setShiftStatus: (shiftId: string, status: ConfigStatus) =>
    unwrap(A.PUT('/shifts/{shiftId}/status', { params: { path: { shiftId } }, body: { status } })),

  lossReasons: (enterpriseId: string) =>
    byStatuses((status) =>
      allPages((page) =>
        unwrap(A.GET('/enterprises/{enterpriseId}/loss-reasons', { params: { path: { enterpriseId }, query: { status, page, size: 200 } } })),
      ),
    ),
  createLossReason: (enterpriseId: string, body: LossReasonCreate) =>
    unwrap(A.POST('/enterprises/{enterpriseId}/loss-reasons', { params: { path: { enterpriseId } }, body })),
  updateLossReason: (lossReasonId: string, body: LossReasonUpdate) =>
    unwrap(A.PUT('/loss-reasons/{lossReasonId}', { params: { path: { lossReasonId } }, body })),
  setLossReasonStatus: (lossReasonId: string, status: ConfigStatus) =>
    unwrap(A.PUT('/loss-reasons/{lossReasonId}/status', { params: { path: { lossReasonId } }, body: { status } })),

  allLines: (enterpriseId: string) =>
    byStatuses((status) =>
      allPages((page) => unwrap(A.GET('/enterprises/{enterpriseId}/lines', { params: { path: { enterpriseId }, query: { status, page, size: 200 } } }))),
    ),
  updateLine: (lineId: string, body: ProductionLineUpdate) => unwrap(A.PUT('/lines/{lineId}', { params: { path: { lineId } }, body })),
  setLineStatus: (lineId: string, status: ConfigStatus) =>
    unwrap(A.PUT('/lines/{lineId}/status', { params: { path: { lineId } }, body: { status } })),

  machine: (machineId: string) => unwrap(A.GET('/machines/{machineId}', { params: { path: { machineId } } })),
  updateMachine: (machineId: string, body: MachineUpdate) =>
    unwrap(A.PUT('/machines/{machineId}', { params: { path: { machineId } }, body })),

  allComponents: (machineId: string) =>
    byStatuses(async (status) => (await unwrap(A.GET('/machines/{machineId}/components', { params: { path: { machineId }, query: { status } } }))).items),
  updateComponent: (componentId: string, body: ComponentUpdate) =>
    unwrap(A.PUT('/components/{componentId}', { params: { path: { componentId } }, body })),
  moveComponent: (componentId: string, parentComponentId: string | null) =>
    unwrap(A.PUT('/components/{componentId}/parent', { params: { path: { componentId } }, body: { parentComponentId } })),
  setComponentStatus: (componentId: string, status: ConfigStatus) =>
    unwrap(A.PUT('/components/{componentId}/status', { params: { path: { componentId } }, body: { status } })),

  allSignals: (machineId: string) =>
    byStatuses((status) =>
      allPages((page) =>
        unwrap(A.GET('/machines/{machineId}/telemetry-signals', { params: { path: { machineId }, query: { status, page, size: 200 } } })),
      ),
    ),
  updateSignal: (signalId: string, body: TelemetrySignalUpdate) =>
    unwrap(A.PUT('/telemetry-signals/{signalId}', { params: { path: { signalId } }, body })),
  setSignalStatus: (signalId: string, status: ConfigStatus) =>
    unwrap(A.PUT('/telemetry-signals/{signalId}/status', { params: { path: { signalId } }, body: { status } })),

  stateConfig: async (machineId: string) => {
    const r = await A.GET('/machines/{machineId}/state-configuration', { params: { path: { machineId } } });
    if (r.response.status === 404) return null;
    return unwrap(Promise.resolve(r));
  },
  createUser: (body: UserCreate) => unwrap(A.POST('/auth/users', { body })),
  createEnterprise: (body: EnterpriseCreate) => unwrap(A.POST('/enterprises', { body })),
  lines: (enterpriseId: string) =>
    allPages((page) => unwrap(A.GET('/enterprises/{enterpriseId}/lines', { params: { path: { enterpriseId }, query: { page, size: 200 } } }))),
  createLine: (enterpriseId: string, body: ProductionLineCreate) =>
    unwrap(A.POST('/enterprises/{enterpriseId}/lines', { params: { path: { enterpriseId } }, body })),
  machines: async (enterpriseId: string) => {
    const load = (status: ConfigStatus) =>
      allPages((page) =>
        unwrap(
          A.GET('/enterprises/{enterpriseId}/machines', {
            params: { path: { enterpriseId }, query: { assignment: 'ALL', status, page, size: 200 } },
          }),
        ),
      );
    const [disabled, active] = await Promise.all([load('DISABLED'), load('ACTIVE')]);
    return [...disabled, ...active];
  },
  createMachine: (enterpriseId: string, body: MachineCreate) =>
    unwrap(A.POST('/enterprises/{enterpriseId}/machines', { params: { path: { enterpriseId } }, body })),
  assign: (lineId: string, machineIds: string[]) =>
    unwrap(A.POST('/lines/{lineId}/machine-assignments', { params: { path: { lineId } }, body: { machineIds } })),
  components: async (machineId: string) =>
    (await unwrap(A.GET('/machines/{machineId}/components', { params: { path: { machineId }, query: { status: 'ACTIVE' } } }))).items,
  createComponent: (machineId: string, body: ComponentCreate) =>
    unwrap(A.POST('/machines/{machineId}/components', { params: { path: { machineId } }, body })),
  signals: (machineId: string) =>
    allPages((page) =>
      unwrap(A.GET('/machines/{machineId}/telemetry-signals', { params: { path: { machineId }, query: { status: 'ACTIVE', page, size: 200 } } })),
    ),
  createSignal: (machineId: string, body: TelemetrySignalCreate) =>
    unwrap(A.POST('/machines/{machineId}/telemetry-signals', { params: { path: { machineId } }, body })),
  readiness: (machineId: string) =>
    unwrap(A.GET('/machines/{machineId}/activation-readiness', { params: { path: { machineId } } })),
  setMachineStatus: (machineId: string, status: ConfigStatus) =>
    unwrap(A.PUT('/machines/{machineId}/status', { params: { path: { machineId } }, body: { status } })),
  validateState: (machineId: string, body: MachineStateConfigurationInput) =>
    unwrap(A.POST('/machines/{machineId}/state-configuration/validate', { params: { path: { machineId } }, body })),
  saveState: (machineId: string, body: MachineStateConfigurationInput) =>
    unwrap(A.PUT('/machines/{machineId}/state-configuration', { params: { path: { machineId } }, body })),
};

export const incidentById = (list: ManualIncident[] | undefined) => new Map((list ?? []).map((i) => [i.id, i]));
