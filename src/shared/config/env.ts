declare global {
  interface Window {
    __ENV__?: { ANALYTICS_API_URL?: string; GENERATOR_API_URL?: string };
  }
}

const runtime = typeof window !== 'undefined' ? (window.__ENV__ ?? {}) : {};
const pick = (...values: Array<string | undefined>) => values.find((v) => v != null && v !== '');

export const env = {
  apiMode: (import.meta.env.VITE_API_MODE ?? 'mock') as 'mock' | 'real',
  analyticsApiUrl: pick(runtime.ANALYTICS_API_URL, import.meta.env.VITE_ANALYTICS_API_URL) ?? '/api/analytics',
  generatorApiUrl: pick(runtime.GENERATOR_API_URL, import.meta.env.VITE_GENERATOR_API_URL) ?? '/api/generator',
};

export type ApiService = 'analytics' | 'generator';
export const serviceUrl = (service: ApiService) =>
  (service === 'analytics' ? env.analyticsApiUrl : env.generatorApiUrl).replace(/\/$/, '');
