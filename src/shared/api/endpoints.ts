import { queryOptions } from '@tanstack/react-query';
import { toIso } from '../lib/time';
import { analyticsClient as A, unwrap } from './client';
import type {
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
      queryFn: async ({ signal }) =>
        (
          await unwrap(
            A.GET('/machines/{machineId}/incidents', {
              params: { path: { machineId }, query: { from: toIso(p.from), to: toIso(p.to), limit: 500 } },
              signal,
            }),
          )
        ).items,
    }),
  enterpriseIncidents: (enterpriseId: string, p: { from: number; to: number; machineId?: string; ongoing?: boolean }) =>
    queryOptions({
      queryKey: [...qk.incidents, 'enterprise', enterpriseId, p],
      queryFn: async ({ signal }) =>
        (
          await unwrap(
            A.GET('/enterprises/{enterpriseId}/incidents', {
              params: {
                path: { enterpriseId },
                query: { from: toIso(p.from), to: toIso(p.to), machineId: p.machineId, ongoing: p.ongoing, limit: 500 },
              },
              signal,
            }),
          )
        ).items,
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

export const incidentById = (list: ManualIncident[] | undefined) => new Map((list ?? []).map((i) => [i.id, i]));
