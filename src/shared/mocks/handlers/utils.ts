import { delay, http, HttpResponse, type DefaultBodyType, type PathParams } from 'msw';
import { MOCK_CONFIG } from '../config';

export const BASE = '*/api/analytics/api/v1';

export const latency = () => {
  const [a, b] = MOCK_CONFIG.latencyMs;
  return delay(a + Math.random() * (b - a));
};

export function apiError(status: number, code: string, message: string, fieldErrors: Array<{ path: string; code: string; message: string }> = []) {
  return HttpResponse.json(
    { code, message, traceId: crypto.randomUUID(), fieldErrors, details: {} },
    { status },
  );
}

export const notFound = (what: string) => apiError(404, 'NOT_FOUND', `${what} не найден`);
export const badRequest = (message: string, fieldErrors: Array<{ path: string; code: string; message: string }> = []) =>
  apiError(400, 'BAD_REQUEST', message, fieldErrors);

const mockErrorFlag = (request: Request) => {
  const flag = (u: string) => new URL(u, 'http://localhost').searchParams.get('mockError') === '1';
  return flag(request.url) || (typeof location !== 'undefined' && flag(location.href));
};

export function query(request: Request) {
  const sp = new URL(request.url).searchParams;
  const str = (k: string) => sp.get(k) ?? undefined;
  const time = (k: string) => {
    const v = sp.get(k);
    if (v == null) return undefined;
    const t = Date.parse(v);
    return Number.isNaN(t) ? NaN : t;
  };
  const int = (k: string, def: number) => {
    const v = sp.get(k);
    return v == null ? def : Number.parseInt(v, 10);
  };
  const bool = (k: string) => sp.get(k) === 'true';
  return { sp, str, time, int, bool };
}

export function page<T>(items: T[], request: Request) {
  const q = query(request);
  const number = Math.max(0, q.int('page', 0));
  const size = Math.min(200, Math.max(1, q.int('size', 50)));
  return {
    items: items.slice(number * size, number * size + size),
    page: { number, size, totalElements: items.length, totalPages: Math.ceil(items.length / size) },
  };
}

export const byStatus = <T extends { status: string }>(items: T[], request: Request) => {
  const status = query(request).str('status') ?? 'ACTIVE';
  return items.filter((i) => i.status === status);
};

type Method = 'get' | 'post' | 'put' | 'delete';
type Resolver = (args: { request: Request; params: PathParams }) => Response | Promise<Response>;

export function route(method: Method, path: string, resolve: Resolver, opts: { auth?: boolean; failable?: boolean } = {}) {
  return http[method]<PathParams, DefaultBodyType>(`${BASE}${path}`, async ({ request, params }) => {
    await latency();
    if (opts.auth !== false && !request.headers.get('Authorization')?.startsWith('Bearer ')) {
      return apiError(401, 'AUTHENTICATION_FAILED', 'Authentication failed');
    }
    if (opts.failable && mockErrorFlag(request)) return apiError(500, 'INTERNAL_ERROR', 'Mock error (mockError=1)');
    return resolve({ request, params });
  });
}
