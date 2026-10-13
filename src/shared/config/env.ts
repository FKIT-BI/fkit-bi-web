declare global {
  interface Window {
    __ENV__?: { API_BASE_URL?: string };
  }
}

const runtime = typeof window !== 'undefined' ? (window.__ENV__ ?? {}) : {};

export const env = {
  apiMode: (import.meta.env.VITE_API_MODE ?? 'mock') as 'mock' | 'real',
  apiBaseUrl: runtime.API_BASE_URL ?? import.meta.env.VITE_API_BASE_URL ?? '',
};
