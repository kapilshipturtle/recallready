// The recall radar: reads the last 30 days of public notices, matches them against the catalog,
// opens cases for High matches and sends the rest to a person to review.
import { fromFda, fromCpsc, noticeRef } from '../lib/notices.js';
import { planScan, mergeSeen, windowStart, boundReviewItem } from '../lib/radar.js';
import { fetchFda, fetchCpsc } from '../platform/feeds.js';
import { loadCatalog } from '../platform/assets.js';
import { getSettings, getState, setState, deleteState, claimOnce } from '../platform/settings.js';
import { startRecall } from './recalls.js';
import { Queue } from '@forge/events';

// Background jobs (sample catalog load and manual scans) share the rr-sample-load queue.
const jobs = new Queue({ key: 'rr-sample-load' });

export async function queueRadarScan() {
  const requestedAt = new Date().toISOString();
  await jobs.push({ body: { kind: 'radar-scan', requestedAt } });
  return { queued: true, requestedAt };
}

const SOURCES = [
  { key: 'fdaFood', label: 'FDA food', load: (since, until) => fetchFda('food', since, until).then((r) => r.map((x) => fromFda(x, 'food'))) },
  { key: 'fdaDrug', label: 'FDA drug', load: (since, until) => fetchFda('drug', since, until).then((r) => r.map((x) => fromFda(x, 'drug'))) },
  { key: 'fdaDevice', label: 'FDA device', load: (since, until) => fetchFda('device', since, until).then((r) => r.map((x) => fromFda(x, 'device'))) },
  { key: 'cpsc', label: 'CPSC', load: (since) => fetchCpsc(since).then((r) => r.map(fromCpsc)) },
];

export const REVIEW_PREFIX = 'rr-review:';
const CLAIM_PREFIX = 'rr-claim:';
const STALE_CLAIM_MS = 15 * 60e3; // a run that died while opening a case

export async function runScan({ now = new Date().toISOString(), who = 'app' } = {}) {
  const settings = await getSettings();
  if (!settings.schemaIds) return { at: now, skipped: 'Set up the catalog first.' };
  const since = windowStart(now);
  const until = now.slice(0, 10);
  const notices = [];
  const errors = [];

  for (const source of SOURCES.filter((s) => settings.sources[s.key])) {
    try {
      notices.push(...(await source.load(since, until)));
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
    notice: item.notice,
    matches: item.matches.map((m) => ({ ...m, productName: productName[m.productKey], lotCodes: m.lotKeys.map((k) => lotCode[k]) })),
    addedAt: now,
  });

  const toReview = plan.queue.map(enrich);
  const openedKeys = [];
  for (const item of plan.open) {
    if (!settings.projectKey) { toReview.push(enrich(item)); continue; }
    const claimKey = `${CLAIM_PREFIX}${item.notice.id}`;
    if (!(await claimOnce(claimKey, { at: now }))) {
      // Another run opened this case, or is opening it right now. A claim left by a run that
      // died half way goes to a person instead of being lost.
      const claim = await getState(claimKey);
      if (claim && !claim.caseKey && Date.parse(now) - Date.parse(claim.at) > STALE_CLAIM_MS) toReview.push(enrich(item));
      continue;
    }
    try {
      const result = await startRecall({ notice: item.notice, selections: item.matches.map((m) => ({ productKey: m.productKey, lotKeys: m.lotKeys })), evidence: item.matches.flatMap((m) => m.evidence), who });
      openedKeys.push(result.issueKey);
      await setState(claimKey, { at: now, caseKey: result.issueKey });
    } catch (error) {
      await deleteState(claimKey).catch(() => null);
      errors.push(`Could not open a case for ${noticeRef(item.notice)}: ${String(error.message || error).slice(0, 160)}`);
      toReview.push(enrich(item));
    }
  }

  // Remember what was handled before anything else can fail, so no notice is acted on twice.
  await setState('radar-seen', mergeSeen(seenIds, plan.seen));
  let queued = 0;
  for (const item of toReview) {
    try {
      await setState(`${REVIEW_PREFIX}${item.notice.id}`, boundReviewItem(item));
      queued += 1;
    } catch (error) {
      errors.push(`Could not save ${noticeRef(item.notice)} for review: ${String(error.message || error).slice(0, 160)}`);
    }
  }
  const summary = { at: now, checked: notices.length, opened: openedKeys.length, openedKeys, queued, errors };
  await setState('radar-last', summary);
  return summary;
}
