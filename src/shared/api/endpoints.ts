import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { toIso } from '../lib/time';
import { request } from './http';
import * as C from './contract';

export interface RangeParams {
  from: number;
  to: number;
  shift?: C.Shift;
  asOf?: number;
}
const range = (p: RangeParams) => ({ from: toIso(p.from), to: toIso(p.to), shift: p.shift ?? 'all' });

export const qk = {
  enterprises: ['enterprises'] as const,
  lines: ['lines'] as const,
  machines: ['machines'] as const,
  reasons: ['loss-reasons'] as const,
  incidents: ['incidents'] as const,
  intervals: ['intervals'] as const,
  analytics: ['analytics'] as const,
  telemetry: ['telemetry'] as const,
};

export const api = {
  enterprises: () =>
    queryOptions({
      queryKey: qk.enterprises,
      queryFn: ({ signal }) => request(z.array(C.EnterpriseSchema), '/enterprises', { signal }),
      staleTime: Infinity,
    }),
  lines: (enterpriseId: string) =>
    queryOptions({
      queryKey: [...qk.lines, enterpriseId],
      queryFn: ({ signal }) =>
        request(z.array(C.LineSchema), `/enterprises/${enterpriseId}/lines`, { signal }),
      staleTime: Infinity,
    }),
  lineMachines: (lineId: string) =>
    queryOptions({
      queryKey: [...qk.machines, 'line', lineId],
      queryFn: ({ signal }) => request(z.array(C.MachineSchema), `/lines/${lineId}/machines`, { signal }),
      staleTime: Infinity,
    }),
  machine: (id: string) =>
    queryOptions({
      queryKey: [...qk.machines, id],
      queryFn: ({ signal }) => request(C.MachineSchema, `/machines/${id}`, { signal }),
      staleTime: Infinity,
    }),
  reasons: () =>
    queryOptions({
      queryKey: qk.reasons,
      queryFn: ({ signal }) => request(z.array(C.LossReasonSchema), '/loss-reasons', { signal }),
      staleTime: Infinity,
    }),
  incidents: (p: { machineId?: string; from?: number; to?: number }) =>
    queryOptions({
      queryKey: [...qk.incidents, p],
      queryFn: ({ signal }) =>
        request(z.array(C.IncidentSchema), '/incidents', {
          signal,
          query: {
            machineId: p.machineId,
            from: p.from != null ? toIso(p.from) : undefined,
            to: p.to != null ? toIso(p.to) : undefined,
          },
        }),
    }),
  incident: (id: string) =>
    queryOptions({
      queryKey: [...qk.incidents, 'one', id],
      queryFn: ({ signal }) => request(C.IncidentSchema, `/incidents/${id}`, { signal }),
    }),
  line: (id: string) =>
    queryOptions({
      queryKey: [...qk.lines, 'one', id],
      queryFn: ({ signal }) => request(C.LineSchema, `/lines/${id}`, { signal }),
      staleTime: Infinity,
    }),
  enterprise: (id: string) =>
    queryOptions({
      queryKey: [...qk.enterprises, id],
      queryFn: ({ signal }) => request(C.EnterpriseSchema, `/enterprises/${id}`, { signal }),
      staleTime: Infinity,
    }),

  createEnterprise: (body: C.EnterpriseInput) =>
    request(C.EnterpriseSchema, '/enterprises', { method: 'POST', body }),
  updateEnterprise: (id: string, body: C.EnterpriseInput) =>
    request(C.EnterpriseSchema, `/enterprises/${id}`, { method: 'PUT', body }),
  createLine: (enterpriseId: string, body: C.LineInput) =>
    request(C.LineSchema, `/enterprises/${enterpriseId}/lines`, { method: 'POST', body }),
  updateLine: (id: string, body: C.LineInput) => request(C.LineSchema, `/lines/${id}`, { method: 'PUT', body }),
  createMachine: (lineId: string, body: C.MachineInput) =>
    request(C.MachineSchema, `/lines/${lineId}/machines`, { method: 'POST', body }),
  updateMachine: (id: string, body: C.MachineInput) =>
    request(C.MachineSchema, `/machines/${id}`, { method: 'PUT', body }),
  createLossReason: (body: C.LossReasonInput) =>
    request(C.LossReasonSchema, '/loss-reasons', { method: 'POST', body }),
  updateLossReason: (id: string, body: C.LossReasonInput) =>
    request(C.LossReasonSchema, `/loss-reasons/${id}`, { method: 'PUT', body }),
  createIncident: (body: C.IncidentInput) =>
    request(C.IncidentSchema, '/incidents', { method: 'POST', body }),
  updateIncident: (id: string, body: C.IncidentInput) =>
    request(C.IncidentSchema, `/incidents/${id}`, { method: 'PUT', body }),
  deleteIncident: (id: string) => request(z.null(), `/incidents/${id}`, { method: 'DELETE' }),

  intervals: (machineId: string, p: RangeParams) =>
    queryOptions({
      queryKey: [...qk.intervals, machineId, p],
      queryFn: ({ signal }) =>
        request(z.array(C.StateIntervalSchema), `/machines/${machineId}/intervals`, {
          signal,
          query: range(p),
        }),
    }),
  summary: (scope: C.Scope, id: string, p: RangeParams) =>
    queryOptions({
      queryKey: [...qk.analytics, 'summary', scope, id, p],
      queryFn: ({ signal }) =>
        request(C.SummarySchema, '/analytics/summary', { signal, query: { scope, id, ...range(p) } }),
    }),
  currentStates: (enterpriseId: string, tick: number) =>
    queryOptions({
      queryKey: [...qk.analytics, 'current-states', enterpriseId, tick],
      queryFn: ({ signal }) =>
        request(z.array(C.CurrentStateSchema), '/analytics/current-states', {
          signal,
          query: { enterpriseId },
        }),
    }),
  lossesTimeseries: (scope: C.Scope, id: string, p: RangeParams & { bucket: 'hour' | 'shift' | 'day' }) =>
    queryOptions({
      queryKey: [...qk.analytics, 'losses-ts', scope, id, p],
      queryFn: ({ signal }) =>
        request(z.array(C.LossesBucketSchema), '/analytics/losses/timeseries', {
          signal,
          query: { scope, id, bucket: p.bucket, ...range(p) },
        }),
    }),
  lossesPareto: (scope: C.Scope, id: string, p: RangeParams & { top?: number }) =>
    queryOptions({
      queryKey: [...qk.analytics, 'losses-pareto', scope, id, p],
      queryFn: ({ signal }) =>
        request(z.array(C.ParetoRowSchema), '/analytics/losses/pareto', {
          signal,
          query: { scope, id, top: p.top, ...range(p) },
        }),
    }),
  chronometry: (p: { machineId: string; date: string; shift: 'day' | 'night'; top?: number; tick: number }) =>
    queryOptions({
      queryKey: [...qk.analytics, 'chronometry', p],
      queryFn: ({ signal }) =>
        request(C.ChronometrySchema, '/analytics/chronometry', {
          signal,
          query: { machineId: p.machineId, date: p.date, shift: p.shift, top: p.top ?? 5 },
        }),
    }),
  telemetryLatest: (machineId: string, tick: number) =>
    queryOptions({
      queryKey: [...qk.telemetry, 'latest', machineId, tick],
      queryFn: ({ signal }) =>
        request(C.TelemetryLatestSchema, `/machines/${machineId}/telemetry/latest`, { signal }),
    }),
  telemetrySeries: (machineId: string, signalName: string, p: { from: number; to: number }) =>
    queryOptions({
      queryKey: [...qk.telemetry, 'series', machineId, signalName, p],
      queryFn: ({ signal }) =>
        request(C.TelemetrySeriesSchema, `/machines/${machineId}/telemetry/series`, {
          signal,
          query: { signal: signalName, from: toIso(p.from), to: toIso(p.to) },
        }),
    }),
};
