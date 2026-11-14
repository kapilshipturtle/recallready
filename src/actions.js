/*
 * Rovo actions. Each export is the handler of one `action` module in manifest.yml. They are
 * used by the RecallReady agent in Rovo, and the read-only ones are published as MCP tools
 * so a store, checkout or support agent can ask "is this lot recalled?" with the user's own
 * permissions. Inputs are top-level payload keys; Rovo passes the work item on screen in
 * payload.context.jira.
 */
import { checkProduct, getCase, listOpenRecalls, checkNotice, startRecall } from './services/recalls.js';
import { caseSummary, customerNotice, regulatorSummary } from './lib/case.js';
import { getSettings } from './platform/settings.js';

const pickKey = (payload) => payload?.issueKey || payload?.context?.jira?.issueKey || payload?.context?.jira?.issue?.key;

function safe(fn) {
  return async (payload, context) => {
    try {
      return await fn(payload, context);
    } catch (error) {
      if (error?.name === 'NEEDS_AUTHENTICATION_ERR') throw error;
      console.error('RecallReady action failed:', String(error?.message || error).slice(0, 200));
      return { error: String(error?.message || error) };
    }
  };
}

async function caseFor(key) {
  let found = await getCase(key, 'user');
  if (found?.role === 'location') found = await getCase(found.caseKey, 'user');
  return found?.role === 'case' ? found : null;
}

// GET: is this product, GTIN, SKU or lot covered by an open recall?
export const checkProductAction = safe(async (payload) => {
  const query = String(payload?.query || '').trim();
  if (!query) return { error: 'Give a product name, GTIN, SKU or lot code.' };
  const r = await checkProduct(query, 'user');
  const answer = r.openCases.length
    ? `Yes. Open recall${r.openCases.length === 1 ? '' : 's'}: ${r.openCases.map((c) => `${c.issueKey} (lots ${c.lots.join(', ')})`).join('; ')}. Do not sell or ship it.`
    : (r.products.length || r.lots.length ? 'No open recall covers it.' : 'It is not in the RecallReady catalog.');
  return { query, answer, productsFound: r.products, lotsFound: r.lots, openRecalls: r.openCases };
});

// GET: progress of one recall: who has confirmed, who has not, clocks, orders.
export const getRecallStatusAction = safe(async (payload) => {
  const key = pickKey(payload);
  if (!key) return { error: 'Which recall? Give the work item key, for example PS-12.' };
  const found = await caseFor(key);
  if (!found) return { error: `${key} is not a RecallReady recall case.` };
  const d = found.caseData;
  const s = caseSummary(d, new Date().toISOString());
  return {
    key: found.issueKey,
    mockRecall: d.drill,
    source: `${d.notice.source} ${d.notice.id}`,
    products: d.products.map((p) => p.name),
    lots: d.lots.map((l) => l.code),
    locationsConfirmed: s.locationsConfirmed,
    locationsTotal: s.locationsTotal,
    unitsPulled: s.recoveredUnits,
    unitsExpected: s.expectedUnits,
    effectivenessPercent: s.effectiveness,
    waitingFor: d.locations.filter((l) => l.confirmedUnits === null).map((l) => ({ location: l.name, expectedUnits: l.expectedUnits, task: l.subtaskKey })),
    confirmedBy: d.locations.filter((l) => l.confirmedUnits !== null).map((l) => ({ location: l.name, units: l.confirmedUnits, by: l.confirmedBy, at: l.confirmedAt, note: l.note })),
    clocks: s.clocks.map((c) => ({ step: c.label, status: c.status, dueAt: c.dueAt, metAt: c.metAt })),
    onlineOrders: d.ordersTotal || d.orders.length,
    closed: Boolean(d.milestones.closed),
  };
});

// GET: every open recall with its progress.
export const listRecallsAction = safe(async () => {
  const rows = await listOpenRecalls('user');
  return {
    openRecalls: rows.map((r) => ({
      key: r.issueKey,
      title: r.title,
      mockRecall: r.drill,
      source: r.source,
      locationsConfirmed: `${r.summary.locationsConfirmed} of ${r.summary.locationsTotal}`,
      unitsPulled: `${r.summary.recoveredUnits} of ${r.summary.expectedUnits}`,
      nextClock: r.summary.nextClock ? `${r.summary.nextClock.label}: ${r.summary.nextClock.status}, due ${r.summary.nextClock.dueAt}` : 'all clocks met',
    })),
  };
});

// GET: check a pasted notice (supplier email, regulator alert) against the catalog.
export const checkNoticeAction = safe(async (payload) => {
  const text = String(payload?.noticeText || '').trim();
  if (text.length < 10) return { error: 'Paste the recall notice text.' };
  const { notice, matches } = await checkNotice(text, 'user');
  return {
    gtinsFound: notice.gtins,
    lotsFound: notice.lots,
    matches: matches.map((m) => ({ product: m.productName, confidence: m.confidence, lots: m.lotCodes, why: m.evidence })),
    nextStep: matches.some((m) => m.confidence === 'High') ? 'High matches can be opened as a recall with start-recall.' : 'No High match. Review Medium and Low matches on the RecallReady board.',
  };
});

// GET: the customer notice and regulator summary for a recall.
export const getCustomerNoticeAction = safe(async (payload) => {
  const key = pickKey(payload);
  if (!key) return { error: 'Which recall? Give the work item key.' };
  const found = await caseFor(key);
  if (!found) return { error: `${key} is not a RecallReady recall case.` };
  const settings = await getSettings();
  return {
    key: found.issueKey,
    affectedOrders: found.caseData.orders.map((o) => ({ order: o.orderNumber, customer: o.customerName, email: o.customerEmail, units: o.units, lot: o.lotCode })),
    customerNotice: customerNotice(found.caseData, settings.company || 'our company'),
    regulatorSummary: regulatorSummary(found.caseData),
  };
});

// CREATE: open a recall case for the High-confidence matches of a notice.
export const startRecallAction = safe(async (payload) => {
  const text = String(payload?.noticeText || '').trim();
  if (text.length < 10) return { error: 'Paste the recall notice text.' };
  const { notice, matches } = await checkNotice(text, 'user');
  const high = matches.filter((m) => m.confidence === 'High');
  if (!high.length) return { error: 'No High-confidence match in the catalog. Review the matches on the RecallReady board before starting a recall.' };
  const drill = payload?.mockRecall === true || String(payload?.mockRecall).toLowerCase() === 'true';
  const result = await startRecall({ notice, selections: high.map((m) => ({ productKey: m.productKey, lotKeys: m.lotKeys })), evidence: high.flatMap((m) => m.evidence), drill, who: 'user' });
  return { created: result.issueKey, stopSaleTasks: result.locations, products: high.map((m) => m.productName), lots: high.flatMap((m) => m.lotCodes), mockRecall: drill };
});
