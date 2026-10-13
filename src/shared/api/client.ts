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

const codeMessages: Record<string, string> = {
  VALIDATION_FAILED: 'Проверьте введённые данные',
  MALFORMED_REQUEST: 'Запрос содержит ошибку',
  NOT_FOUND: 'Данные не найдены',
  CONFLICT: 'Данные были изменены или конфликтуют с текущим состоянием',
  INTERNAL_ERROR: 'На сервере произошла ошибка',
  AUTHENTICATION_FAILED: 'Не удалось войти в систему',
};

export function formatApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body;
    const russianMessage = body?.message && /[А-Яа-яЁё]/.test(body.message) ? body.message : undefined;
    const fieldMessage = body?.fieldErrors.find((field) => /[А-Яа-яЁё]/.test(field.message))?.message;
    const message = russianMessage ?? fieldMessage ?? (body?.code ? codeMessages[body.code] : undefined) ??
      (error.status === 429 ? 'Слишком много запросов. Повторите позже' : error.status >= 500 ? 'Сервис временно недоступен' : 'Не удалось выполнить запрос');
    return body?.traceId ? `${message} · код обращения ${body.traceId}` : message;
  }
  if (error instanceof DOMException && error.name === 'AbortError') return 'Запрос отменён';
  return 'Не удалось связаться с сервисом';
}

export function shouldRetryRequest(failureCount: number, error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return false;
  if (error instanceof ApiError) return failureCount < 2 && (error.status === 429 || error.status >= 500);
  return failureCount < 2;
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

const absolute = (url: string) =>
  typeof window !== 'undefined' ? new URL(url, window.location.origin).toString().replace(/\/$/, '') : url;

export const analyticsClient = createClient<paths>({ baseUrl: absolute(`${serviceUrl('analytics')}/api/v1`), fetch: fetchLate });
export const generatorClient = createClient<GeneratorPaths>({ baseUrl: absolute(`${serviceUrl('generator')}/api/v1`), fetch: fetchLate });
analyticsClient.use(auth);
generatorClient.use(auth);

export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await p;
  if (!response.ok) throw new ApiError(response.status, error as ErrorResponse | undefined);
  return data as T;
}
