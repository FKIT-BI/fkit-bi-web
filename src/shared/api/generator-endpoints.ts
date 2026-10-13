import { queryOptions } from '@tanstack/react-query';
import { generatorClient as G, unwrap } from './client';
import type { GeneratorStatus, GenerationRunDetail, RunCreate, RunMode, RunStatus, ScenarioCreate, ScenarioUpdate } from './generator-types';

export const gk = {
  scenarios: ['generator', 'scenarios'] as const,
  runs: ['generator', 'runs'] as const,
};

export interface RunFilters {
  scenarioId?: string;
  machineId?: string;
  mode?: RunMode;
  status?: RunStatus[];
}

const ACTIVE_RUN: RunStatus[] = ['SCHEDULED', 'QUEUED', 'RUNNING', 'STOP_REQUESTED'];
export const isRunActive = (status: RunStatus) => ACTIVE_RUN.includes(status);

export const gen = {
  scenarios: (enterpriseId: string, status: GeneratorStatus, search?: string) =>
    queryOptions({
      queryKey: [...gk.scenarios, 'list', enterpriseId, status, search ?? ''],
      queryFn: ({ signal }) =>
        unwrap(G.GET('/scenarios', { params: { query: { enterpriseId, status, search: search || undefined, size: 200 } }, signal })),
    }),
  scenario: (scenarioId: string) =>
    queryOptions({
      queryKey: [...gk.scenarios, 'detail', scenarioId],
      queryFn: ({ signal }) => unwrap(G.GET('/scenarios/{scenarioId}', { params: { path: { scenarioId } }, signal })),
    }),
  createScenario: (body: ScenarioCreate) => unwrap(G.POST('/scenarios', { body })),
  updateScenario: (scenarioId: string, body: ScenarioUpdate) =>
    unwrap(G.PUT('/scenarios/{scenarioId}', { params: { path: { scenarioId } }, body })),
  setScenarioStatus: (scenarioId: string, status: GeneratorStatus) =>
    unwrap(G.PUT('/scenarios/{scenarioId}/status', { params: { path: { scenarioId } }, body: { status } })),
  validateScenario: (body: ScenarioCreate) => unwrap(G.POST('/scenarios/validate', { body })),

  runs: (enterpriseId: string, f: RunFilters = {}, refetchMs: number | false = false) =>
    queryOptions({
      queryKey: [...gk.runs, 'list', enterpriseId, f],
      queryFn: ({ signal }) =>
        unwrap(G.GET('/runs', { params: { query: { enterpriseId, ...f, limit: 100 } }, signal })),
      refetchInterval: refetchMs,
    }),
  run: (runId: string) =>
    queryOptions({
      queryKey: [...gk.runs, 'detail', runId],
      queryFn: ({ signal }) => unwrap(G.GET('/runs/{runId}', { params: { path: { runId } }, signal })),
      refetchInterval: (q) => (q.state.data && !isRunActive((q.state.data as GenerationRunDetail).status) ? false : 2000),
    }),
  validateRun: (body: RunCreate) => unwrap(G.POST('/runs/validate', { body })),
  createRun: (body: RunCreate, idempotencyKey: string) =>
    unwrap(G.POST('/runs', { params: { header: { 'Idempotency-Key': idempotencyKey } }, body })),
  stopRun: (runId: string) => unwrap(G.POST('/runs/{runId}/stop', { params: { path: { runId } } })),
  retryRun: (runId: string) => unwrap(G.POST('/runs/{runId}/retry', { params: { path: { runId } } })),
};
