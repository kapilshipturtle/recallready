// Pure planning for a radar scan: which public notices open a case, which go to review.
import { matchNotice } from './match.js';

// seenIds are notices that already opened a case or went to review. A notice that matched
// nothing is not remembered, so it is matched again after the catalog changes.
export function planScan({ notices, catalog, seenIds }) {
  const seenBefore = new Set(seenIds || []);
  const handled = new Set();
  const open = [];
  const queue = [];
  const seen = [];
  for (const notice of notices || []) {
    if (seenBefore.has(notice.id) || handled.has(notice.id)) continue;
    handled.add(notice.id);
    const matches = matchNotice(notice, catalog);
    if (matches.length) seen.push(notice.id);
    const high = matches.filter((m) => m.confidence === 'High');
    const review = matches.filter((m) => m.confidence !== 'High');
    if (high.length) open.push({ notice, matches: high });
    if (review.length) queue.push({ notice, matches: review });
  }
  return { open, queue, seen };
}

// Remembered notice ids: newest last, at most `cap` kept.
export function mergeSeen(previous, added, cap = 5000) {
  const fresh = new Set(added);
  return [...(previous || []).filter((id) => !fresh.has(id)), ...added].slice(-cap);
}

// Every scan reads the last 30 days. openFDA publishes each weekly batch days after its report
// date, so a window that starts at the last scan would miss whole batches.
export function windowStart(now) {
  return new Date(Date.parse(now) - 30 * 86400e3).toISOString().slice(0, 10);
}

const cutText = (text, max) => String(text || '').slice(0, max);

// One review item stays a few kilobytes however large the brand is: notice text and lists are
// trimmed, and at most 20 Medium and 10 Low matches are kept (with the total).
export function boundReviewItem(item) {
  const n = item.notice || {};
  const notice = {
    ...n,
    title: cutText(n.title, 200),
    productText: cutText(n.productText, 600),
    codeText: cutText(n.codeText, 400),
    reason: cutText(n.reason, 300),
    firm: cutText(n.firm, 200),
    lots: (n.lots || []).slice(0, 20),
    gtins: [...new Set(n.gtins || [])].slice(0, 20),
    models: (n.models || []).slice(0, 20),
  };
  const all = item.matches || [];
  const keep = [...all.filter((m) => m.confidence !== 'Low').slice(0, 20), ...all.filter((m) => m.confidence === 'Low').slice(0, 10)];
  return {
    ...item,
    notice,
    matches: keep.map((m) => ({ ...m, lotKeys: (m.lotKeys || []).slice(0, 20), lotCodes: (m.lotCodes || []).slice(0, 20), evidence: (m.evidence || []).slice(0, 4) })),
    totalMatches: all.length,
  };
}

// The CPSC API reports its own failures as HTTP 200 with a fake row (RecallID 0, title
// "Error retrieving Recalls: ..."). Split those out so they are shown as errors.
export function cleanCpsc(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const bad = list.filter((r) => !r || !r.RecallID || !r.RecallNumber);
  const records = list.filter((r) => r && r.RecallID && r.RecallNumber);
  return { records, error: bad.length ? String(bad[0]?.Title || 'CPSC returned an error row') : '' };
}
