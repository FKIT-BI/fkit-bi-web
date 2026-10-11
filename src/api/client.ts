import type { components as AnalyticsComponents } from './analytics.generated';
import type { components as AuthComponents } from './auth.generated';

export type Enterprise = AnalyticsComponents['schemas']['Enterprise'];
export type ProductionLine = AnalyticsComponents['schemas']['ProductionLine'];
export type Machine = AnalyticsComponents['schemas']['Machine'];
export type Component = AnalyticsComponents['schemas']['Component'];
export type TelemetrySignal = AnalyticsComponents['schemas']['TelemetrySignal'];
export type LoginRequest = AuthComponents['schemas']['LoginRequest'];
export type LoginResponse = AuthComponents['schemas']['LoginResponse'];
export type ApiErrorBody = AnalyticsComponents['schemas']['ErrorResponse'];

const base = `${import.meta.env.VITE_ANALYTICS_API_URL ?? '/api/analytics'}/v1`;
export const tokenKey = 'fkit-bi-access-token';

export class ApiError extends Error {
  constructor(readonly status: number, readonly body: ApiErrorBody) {
    super(body.message || body.code);
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem(tokenKey);
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${base}${path}`, { ...init, headers });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) sessionStorage.removeItem(tokenKey);
    throw new ApiError(response.status, body as ApiErrorBody);
  }
  return body as T;
}

export const api = {
  login: (input: LoginRequest) => request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  enterprises: () => request<{ items: Enterprise[] }>('/enterprises?status=ACTIVE&page=0&size=200'),
  createEnterprise: (input: AnalyticsComponents['schemas']['EnterpriseCreate']) => request<Enterprise>('/enterprises', { method: 'POST', body: JSON.stringify(input) }),
  lines: (enterpriseId: string) => request<{ items: ProductionLine[] }>(`/enterprises/${enterpriseId}/lines?status=ACTIVE&page=0&size=200`),
  createLine: (enterpriseId: string, input: AnalyticsComponents['schemas']['ProductionLineCreate']) => request<ProductionLine>(`/enterprises/${enterpriseId}/lines`, { method: 'POST', body: JSON.stringify(input) }),
  async machines(enterpriseId: string) { const [disabled, active] = await Promise.all([request<{ items: Machine[] }>(`/enterprises/${enterpriseId}/machines?assignment=ALL&status=DISABLED&page=0&size=200`), request<{ items: Machine[] }>(`/enterprises/${enterpriseId}/machines?assignment=ALL&status=ACTIVE&page=0&size=200`)]); return { items: [...disabled.items, ...active.items] }; },
  createMachine: (enterpriseId: string, input: AnalyticsComponents['schemas']['MachineCreate']) => request<Machine>(`/enterprises/${enterpriseId}/machines`, { method: 'POST', body: JSON.stringify(input) }),
  assign: (lineId: string, machineIds: string[]) => request<{ items: Machine[] }>(`/lines/${lineId}/machine-assignments`, { method: 'POST', body: JSON.stringify({ machineIds }) }),
  components: (machineId: string) => request<{ items: Component[] }>(`/machines/${machineId}/components?status=ACTIVE`),
  createComponent: (machineId: string, input: AnalyticsComponents['schemas']['ComponentCreate']) => request<Component>(`/machines/${machineId}/components`, { method: 'POST', body: JSON.stringify(input) }),
  signals: (machineId: string) => request<{ items: TelemetrySignal[] }>(`/machines/${machineId}/telemetry-signals?status=ACTIVE&page=0&size=200`),
  createSignal: (machineId: string, input: AnalyticsComponents['schemas']['TelemetrySignalCreate']) => request<TelemetrySignal>(`/machines/${machineId}/telemetry-signals`, { method: 'POST', body: JSON.stringify(input) }),
  readiness: (machineId: string) => request<{ machineId: string; ready: boolean; errors: Array<{ code: string; message: string }>; warnings: Array<{ code: string; message: string }> }>(`/machines/${machineId}/activation-readiness`),
  statusMachine: (machineId: string, status: 'ACTIVE' | 'DISABLED') => request<Machine>(`/machines/${machineId}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  validateState: (machineId: string, config: unknown) => request<{ valid: boolean; normalizedConfiguration: unknown | null; errors: Array<{ code: string; message: string; path?: string | null }>; warnings: Array<{ code: string; message: string; path?: string | null }> }>(`/machines/${machineId}/state-configuration/validate`, { method: 'POST', body: JSON.stringify(config) }),
  saveState: (machineId: string, config: AnalyticsComponents['schemas']['MachineStateConfigurationInput']) => request(`/machines/${machineId}/state-configuration`, { method: 'PUT', body: JSON.stringify(config) }),
};
