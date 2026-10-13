import type { z } from 'zod';
import { serviceUrl, type ApiService } from '../config/env';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

function buildUrl(service: ApiService, path: string, query?: Query) {
  const url = new URL(serviceUrl(service) + path, window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export async function request<S extends z.ZodType>(
  schema: S,
  path: string,
  init: { method?: string; query?: Query; body?: unknown; signal?: AbortSignal; service?: ApiService } = {},
): Promise<z.output<S>> {
  const res = await fetch(buildUrl(init.service ?? 'analytics', path, init.query), {
    method: init.method ?? 'GET',
    headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) msg = body.message;
    } catch {
    }
    throw new ApiError(res.status, msg);
  }
  const data = res.status === 204 ? null : await res.json();
  return schema.parse(data);
}
