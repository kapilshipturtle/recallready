// Resolvers for the RecallReady issue panel. The work item key always comes from the Forge
// context, never from the browser.
import { getCase, confirm, setMilestone, closeRecall, ordersForLots } from '../services/recalls.js';
import { caseSummary, customerNotice, regulatorSummary } from '../lib/case.js';
import { getSettings } from '../platform/settings.js';
import { resultFromError } from '../lib/errors.js';
import { noticeHeadline } from '../lib/notices.js';

const keyFrom = (context) => context?.extension?.issue?.key;

async function panelState(issueKey) {
  const found = await getCase(issueKey, 'user');
  if (!found) return { ok: true, mode: 'none' };
  const now = new Date().toISOString();
  if (found.role === 'location') {
    const parent = await getCase(found.caseKey, 'user');
    const location = parent?.caseData?.locations.find((l) => l.key === found.locationKey) || null;
    return { ok: true, mode: 'location', caseKey: found.caseKey, caseTitle: parent ? parent.caseData.notice.title : '', drill: Boolean(parent?.caseData?.drill), closed: Boolean(parent?.caseData?.milestones?.closed), location };
  }
  const settings = await getSettings();
  const data = found.caseData;
  return {
    ok: true,
    mode: 'case',
    issueKey,
    caseData: data,
    headline: noticeHeadline(data.notice),
    summary: caseSummary(data, now),
    subtasks: found.subtasks,
    orders: await ordersForLots(settings.schemaIds, data.lots.map((l) => l.key)).catch(() => null),
    customerNotice: customerNotice(data, settings.company || 'our company'),
    regulatorSummary: regulatorSummary(data),
  };
}

export function definePanel(resolver) {
  resolver.define('getPanel', async ({ context }) => {
    try {
      return await panelState(keyFrom(context));
    } catch (error) {
      return resultFromError(error);
    }
  });

  resolver.define('confirmHere', async ({ payload, context }) => {
    try {
      await confirm({ issueKey: keyFrom(context), units: payload?.units, note: payload?.note, who: 'user' });
      return await panelState(keyFrom(context));
    } catch (error) {
      return resultFromError(error);
    }
  });

  resolver.define('markMilestoneHere', async ({ payload, context }) => {
    try {
      if (!['customerNotice', 'regulatorSummary'].includes(payload?.key)) return { ok: false, message: 'Unknown step.' };
      await setMilestone({ issueKey: keyFrom(context), key: payload.key, who: 'user' });
      return await panelState(keyFrom(context));
    } catch (error) {
      return resultFromError(error);
    }
  });

  resolver.define('closeHere', async ({ context }) => {
    try {
      const { record } = await closeRecall({ issueKey: keyFrom(context), who: 'user' });
      return { ...(await panelState(keyFrom(context))), closingRecord: record };
    } catch (error) {
      return resultFromError(error);
    }
  });
}
