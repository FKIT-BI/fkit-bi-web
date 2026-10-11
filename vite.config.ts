import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/analytics': {
          target: env.VITE_ANALYTICS_PROXY_TARGET ?? 'http://localhost:8080',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api\/analytics/, ''),
        },
        '/api/generator': {
          target: env.VITE_GENERATOR_PROXY_TARGET ?? 'http://localhost:8081',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api\/generator/, ''),
        },
      },
    },
  };
});
