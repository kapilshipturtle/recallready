// Scheduled trigger: the hourly recall radar (runs without a user, as the app).
import { runScan } from './services/radar.js';

export async function radarTrigger() {
  const result = await runScan({ who: 'app' });
  console.log(`radar: checked ${result.checked ?? 0}, opened ${result.opened ?? 0}, queued ${result.queued ?? 0}, errors ${(result.errors || []).length}`);
}
