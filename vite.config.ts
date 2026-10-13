/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const proxy = (prefix: string, target: string | undefined): Record<string, ProxyOptions> =>
  target
    ? {
        [prefix]: {
          target,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(new RegExp(`^${prefix}`), ''),
        },
      }
    : {};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      proxy: {
        ...proxy('/api/analytics', env.VITE_ANALYTICS_PROXY_TARGET),
        ...proxy('/api/generator', env.VITE_GENERATOR_PROXY_TARGET),
      },
    },
    preview: {
      proxy: {
        ...proxy('/api/analytics', env.VITE_ANALYTICS_PROXY_TARGET),
        ...proxy('/api/generator', env.VITE_GENERATOR_PROXY_TARGET),
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
