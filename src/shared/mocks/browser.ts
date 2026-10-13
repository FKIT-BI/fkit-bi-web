import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { loadPersisted } from './persist';

export async function startMocks() {
  loadPersisted();
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
}
