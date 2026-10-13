import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';

async function bootstrap() {
  if ((import.meta.env.VITE_API_MODE ?? 'mock') === 'mock') {
    const { startMocks } = await import('@/shared/mocks/browser');
    await startMocks();
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
