// The recall radar: reads new public notices, matches them against the catalog, opens cases
// for High matches and queues the rest for a person to review.
import { fromFda, fromCpsc } from '../lib/notices.js';
import { planScan, mergeSeen, sinceDate } from '../lib/radar.js';
import { fetchFda, fetchCpsc } from '../platform/feeds.js';
import { loadCatalog } from '../platform/assets.js';
import { getSettings, getState, setState } from '../platform/settings.js';
import { startRecall } from './recalls.js';

const SOURCES = [
  { key: 'fdaFood', label: 'FDA food', load: (since, until) => fetchFda('food', since, until).then((r) => r.map((x) => fromFda(x, 'food'))) },
  { key: 'fdaDrug', label: 'FDA drug', load: (since, until) => fetchFda('drug', since, until).then((r) => r.map((x) => fromFda(x, 'drug'))) },
  { key: 'fdaDevice', label: 'FDA device', load: (since, until) => fetchFda('device', since, until).then((r) => r.map((x) => fromFda(x, 'device'))) },
  { key: 'cpsc', label: 'CPSC', load: (since) => fetchCpsc(since).then((r) => r.map(fromCpsc)) },
];

const trimNotice = (n) => ({ ...n, productText: String(n.productText || '').slice(0, 600), codeText: String(n.codeText || '').slice(0, 400), title: String(n.title || '').slice(0, 200) });

export async function runScan({ now = new Date().toISOString(), who = 'app' } = {}) {
  const settings = await getSettings();
  if (!settings.schemaIds) return { at: now, skipped: 'Set up the catalog first.' };
  const cursors = (await getState('radar-cursors', {})) || {};
  const until = now.slice(0, 10);
  const notices = [];
  const errors = [];
  const nextCursors = { ...cursors };

  for (const source of SOURCES.filter((s) => settings.sources[s.key])) {
    try {
      notices.push(...(await source.load(sinceDate(cursors[source.key], now), until)));
      nextCursors[source.key] = now; // only a successful read moves this source forward
    } catch (error) {
      errors.push(`${source.label}: ${String(error.message || error).slice(0, 160)}`);
    }
  }

  const catalog = await loadCatalog(settings.schemaIds);
  const seenIds = (await getState('radar-seen', [])) || [];
  const plan = planScan({ notices, catalog, seenIds });
  const productName = Object.fromEntries(catalog.products.map((p) => [p.key, p.name]));
  const lotCode = Object.fromEntries(catalog.lots.map((l) => [l.key, l.code]));
  const enrich = (item) => ({
    notice: trimNotice(item.notice),
    matches: item.matches.map((m) => ({ ...m, productName: productName[m.productKey], lotCodes: m.lotKeys.map((k) => lotCode[k]) })),
    addedAt: now,
  });

  const toReview = plan.queue.map(enrich);
  const openedKeys = [];
  for (const item of plan.open) {
    if (!settings.projectKey) { toReview.push(enrich(item)); continue; }
    try {
      const result = await startRecall({ notice: item.notice, selections: item.matches.map((m) => ({ productKey: m.productKey, lotKeys: m.lotKeys })), evidence: item.matches.flatMap((m) => m.evidence), who });
      openedKeys.push(result.issueKey);
    } catch (error) {
      errors.push(`Could not open a case for ${item.notice.id}: ${String(error.message || error).slice(0, 160)}`);
      toReview.push(enrich(item));
    }
  }

  const queue = [...((await getState('radar-queue', [])) || []), ...toReview].slice(-100);
  await setState('radar-queue', queue);
  await setState('radar-seen', mergeSeen(seenIds, plan.seen));
  await setState('radar-cursors', nextCursors);
  const summary = { at: now, checked: notices.length, opened: openedKeys.length, openedKeys, queued: toReview.length, errors };
  await setState('radar-last', summary);
  return summary;
}
