// Pure planning for a radar scan: which public notices open a case, which go to review.
import { matchNotice } from './match.js';

export function planScan({ notices, catalog, seenIds }) {
  const seenBefore = new Set(seenIds || []);
  const handled = new Set();
  const open = [];
  const queue = [];
  const seen = [];
  for (const notice of notices || []) {
    if (seenBefore.has(notice.id) || handled.has(notice.id)) continue;
    handled.add(notice.id);
    seen.push(notice.id);
    const matches = matchNotice(notice, catalog);
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

// First scan looks back 30 days; later scans start from the day of the last scan (overlap is
// harmless because seen ids are skipped).
export function sinceDate(lastScanAt, now) {
  if (!lastScanAt) return new Date(Date.parse(now) - 30 * 86400e3).toISOString().slice(0, 10);
  return String(lastScanAt).slice(0, 10);
}

// The CPSC API reports its own failures as HTTP 200 with a fake row (RecallID 0, title
// "Error retrieving Recalls: ..."). Split those out so they are shown as errors.
export function cleanCpsc(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const bad = list.filter((r) => !r || !r.RecallID || !r.RecallNumber);
  const records = list.filter((r) => r && r.RecallID && r.RecallNumber);
  return { records, error: bad.length ? String(bad[0]?.Title || 'CPSC returned an error row') : '' };
}
