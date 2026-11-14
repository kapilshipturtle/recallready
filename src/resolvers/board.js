// Resolvers for the Recall board (Jira global page).
import { listOpenRecalls, checkNotice, startRecall } from '../services/recalls.js';
import { loadCatalog } from '../platform/assets.js';
import { getSettings, getState, setState, deleteState, listState } from '../platform/settings.js';
import { siteUrl, canCreateIn, myName } from '../platform/jira.js';
import { REVIEW_PREFIX } from '../services/radar.js';
import { fromText, noticeHeadline } from '../lib/notices.js';
import { resultFromError } from '../lib/errors.js';

async function ready() {
  const settings = await getSettings();
  if (!settings.schemaIds) return { settings, message: 'Set up the catalog first: Jira settings, Apps, RecallReady.' };
  if (!settings.projectKey) return { settings, message: 'Choose the project for recall cases: Jira settings, Apps, RecallReady.' };
  return { settings, message: '' };
}

const baseUrl = async (context) => context?.siteUrl || (await siteUrl('user').catch(() => ''));

// Removes only the matches that were acted on; the rest of the notice stays for review.
async function keepOthers(key, item, productKeys) {
  const remaining = (item.matches || []).filter((m) => !productKeys.includes(m.productKey));
  if (remaining.length) await setState(key, { ...item, matches: remaining });
  else await deleteState(key);
}

export function defineBoard(resolver) {
  resolver.define('getBoard', async ({ context }) => {
    try {
      const { message } = await ready();
      const url = await baseUrl(context);
      const [radar, stored] = await Promise.all([getState('radar-last'), listState(REVIEW_PREFIX, 100)]);
      const queue = stored.map((r) => ({ ...r.value, headline: noticeHeadline(r.value.notice) }))
        .sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
      if (message) return { ok: true, setupNeeded: true, message, siteUrl: url, radar, queue };
      const recalls = await listOpenRecalls('user');
      const kpis = {
        open: recalls.length,
        locationsPending: recalls.reduce((s, r) => s + (r.summary.locationsTotal - r.summary.locationsConfirmed), 0),
        unitsOutstanding: recalls.reduce((s, r) => s + Math.max(0, r.summary.expectedUnits - r.summary.recoveredUnits), 0),
        overdue: recalls.reduce((s, r) => s + r.summary.clocks.filter((c) => c.status === 'overdue').length, 0),
      };
      return { ok: true, setupNeeded: false, siteUrl: url, recalls, kpis, radar, queue };
    } catch (error) {
      return resultFromError(error);
    }
  });

  resolver.define('getDrillOptions', async () => {
    try {
      const { settings, message } = await ready();
      if (message) return { ok: false, message };
      const catalog = await loadCatalog(settings.schemaIds);
      return {
        ok: true,
        products: catalog.products.map((p) => ({ key: p.key, name: p.name })).sort((a, b) => a.name.localeCompare(b.name)),
        lots: catalog.lots.map((l) => ({ key: l.key, code: l.code, productKey: l.productKey, bestBy: l.bestBy })),
      };
    } catch (error) {
      return resultFromError(error);
    }
  });

  resolver.define('checkNoticeText', async ({ payload }) => {
    try {
      const text = String(payload?.text || '').trim();
      if (text.length < 10) return { ok: false, message: 'Paste the recall notice text first.' };
      const { notice, matches } = await checkNotice(text, 'user');
      return { ok: true, notice: { id: notice.id, title: notice.title, gtins: notice.gtins, lots: notice.lots }, matches };
    } catch (error) {
      return resultFromError(error);
    }
  });

  resolver.define('startFromNotice', async ({ payload, context }) => {
    try {
      const text = String(payload?.text || '').trim();
      const keys = Array.isArray(payload?.productKeys) ? payload.productKeys : [payload?.productKey];
      const { notice, matches } = await checkNotice(text, 'user');
      const chosen = matches.filter((m) => keys.includes(m.productKey));
      if (!chosen.length) return { ok: false, message: 'Choose at least one matching product.' };
      // One case for every product chosen from this notice.
      const result = await startRecall({ notice, selections: chosen.map((m) => ({ productKey: m.productKey, lotKeys: m.lotKeys })), evidence: chosen.flatMap((m) => m.evidence), who: 'user' });
      return { ok: true, ...result, url: `${await baseUrl(context)}/browse/${result.issueKey}` };
    } catch (error) {
      return resultFromError(error);
    }
  });

  resolver.define('runDrill', async ({ payload, context }) => {
    try {
      const { settings, message } = await ready();
      if (message) return { ok: false, message };
      const catalog = await loadCatalog(settings.schemaIds);
      const product = catalog.products.find((p) => p.key === payload?.productKey);
      if (!product) return { ok: false, message: 'Choose a product for the mock recall.' };
      const now = new Date().toISOString();
      const notice = {
        ...fromText(`Mock recall of ${product.name} ${now}`),
        source: 'Mock recall',
        id: `DRILL:${now.replace(/[^0-9]/g, '').slice(0, 14)}`,
        title: `Mock recall of ${product.name}`,
        date: now.slice(0, 10),
        reason: 'Recall test: this is a mock recall, no product is actually affected.',
      };
      const result = await startRecall({ notice, selections: [{ productKey: product.key, lotKeys: payload?.lotKeys || [] }], drill: true, who: 'user' });
      return { ok: true, ...result, url: `${await baseUrl(context)}/browse/${result.issueKey}` };
    } catch (error) {
      return resultFromError(error);
    }
  });

  resolver.define('startFromReview', async ({ payload, context }) => {
    try {
      const key = `${REVIEW_PREFIX}${payload?.noticeId}`;
      const item = await getState(key);
      const keys = Array.isArray(payload?.productKeys) ? payload.productKeys : [payload?.productKey];
      const chosen = (item?.matches || []).filter((m) => keys.includes(m.productKey));
      if (!item || !chosen.length) return { ok: false, message: 'That review item is gone. Refresh the board.' };
      const result = await startRecall({ notice: item.notice, selections: chosen.map((m) => ({ productKey: m.productKey, lotKeys: m.lotKeys })), evidence: chosen.flatMap((m) => m.evidence), who: 'user' });
      await keepOthers(key, item, keys);
      return { ok: true, ...result, url: `${await baseUrl(context)}/browse/${result.issueKey}` };
    } catch (error) {
      return resultFromError(error);
    }
  });

  resolver.define('dismissReview', async ({ payload }) => {
    try {
      const { settings } = await ready();
      if (!settings.projectKey || !(await canCreateIn(settings.projectKey, 'user'))) {
        return { ok: false, message: 'Only people who can create work items in the recall project can dismiss review items.' };
      }
      const key = `${REVIEW_PREFIX}${payload?.noticeId}`;
      const item = await getState(key);
      if (!item) return { ok: true };
      const keys = Array.isArray(payload?.productKeys) ? payload.productKeys : (item.matches || []).map((m) => m.productKey);
      await keepOthers(key, item, keys);
      const by = await myName('user').catch(() => 'Someone');
      const log = (await getState('radar-dismissed', [])) || [];
      await setState('radar-dismissed', [...log, { noticeId: payload?.noticeId, products: keys, by, at: new Date().toISOString() }].slice(-200));
      return { ok: true };
    } catch (error) {
      return resultFromError(error);
    }
  });
}
