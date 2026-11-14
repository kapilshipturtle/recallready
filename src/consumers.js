// Async event consumers.
import { loadSample } from './services/setup.js';

export async function sampleLoader(event) {
  if (event?.body?.kind === 'load-sample') await loadSample();
}
