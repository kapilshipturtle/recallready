// Async event consumers.
import { loadSample } from './services/setup.js';
import { runScan } from './services/radar.js';

// One queue runs the app's background jobs: the sample catalog load and manual radar scans.
export async function sampleLoader(event) {
  if (event?.body?.kind === 'load-sample') await loadSample();
  if (event?.body?.kind === 'radar-scan') await runScan({ who: 'app' });
}
