import { delay, HttpResponse } from 'msw';
import type { z } from 'zod';
import { MOCK_CONFIG } from '../config';

export const latency = () => {
  const [a, b] = MOCK_CONFIG.latencyMs;
  return delay(a + Math.random() * (b - a));
};

export function mockError(request: Request) {
  const flag = (u: string) => new URL(u, 'http://localhost').searchParams.get('mockError') === '1';
  if (flag(request.url) || (typeof location !== 'undefined' && flag(location.href))) {
    return HttpResponse.json({ message: 'Mock error (mockError=1)' }, { status: 500 });
  }
  return null;
}

export function query(request: Request) {
  const sp = new URL(request.url).searchParams;
  const time = (k: string) => {
    const v = sp.get(k);
    return v ? Date.parse(v) : undefined;
  };
  return { sp, time, str: (k: string) => sp.get(k) ?? undefined };
}

export const notFound = (what: string) => HttpResponse.json({ message: `${what} не найден` }, { status: 404 });
export const badRequest = (message: string) => HttpResponse.json({ message }, { status: 400 });

export async function parseBody<S extends z.ZodType>(request: Request, schema: S) {
  const res = schema.safeParse(await request.json().catch(() => undefined));
  if (res.success) return { data: res.data as z.output<S>, error: null };
  const msg = res.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
  return { data: null, error: badRequest(msg) };
}

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
