import createClient, { type Middleware } from 'openapi-fetch';
import { serviceUrl } from '../config/env';
import { useAuth } from '../model/auth';
import type { components, paths } from './generated/analytics';
import type { paths as GeneratorPaths } from './generated/generator';

type ErrorResponse = components['schemas']['ErrorResponse'];

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body?: ErrorResponse,
  ) {
    super(body?.message || body?.code || `HTTP ${status}`);
  }
  get fieldErrors() {
    return this.body?.fieldErrors ?? [];
  }
}

const auth: Middleware = {
  onRequest({ request }) {
    const token = useAuth.getState().token;
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    return request;
  },
  onResponse({ response, request }) {
    if (response.status === 401 && !request.url.endsWith('/auth/login')) useAuth.getState().signOut();
    return response;
  },
};

const fetchLate: typeof fetch = (input, init) => globalThis.fetch(input, init);

export const analyticsClient = createClient<paths>({ baseUrl: `${serviceUrl('analytics')}/api/v1`, fetch: fetchLate });
export const generatorClient = createClient<GeneratorPaths>({ baseUrl: `${serviceUrl('generator')}/api/v1`, fetch: fetchLate });
analyticsClient.use(auth);
generatorClient.use(auth);

export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await p;
  if (!response.ok) throw new ApiError(response.status, error as ErrorResponse | undefined);
  return data as T;
}
