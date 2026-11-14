// Answers given to people from recall data. Pure functions.

// "Can we still sell this?" A real open recall is always a no. A mock recall is a test and never
// stops a sale. If not every open recall could be read, there is no all-clear.
export function productAnswer({ products, lots, openCases, complete }) {
  const real = (openCases || []).filter((c) => !c.drill);
  const drills = (openCases || []).filter((c) => c.drill);
  if (real.length) {
    return `Yes. Open recall${real.length === 1 ? '' : 's'}: ${real.map((c) => `${c.issueKey} (lots ${c.lots.join(', ')})`).join('; ')}. Do not sell or ship it.`;
  }
  if (!complete) return 'Could not check every open recall, so this is not an all-clear. Check the RecallReady board.';
  if (!(products || []).length && !(lots || []).length) return 'It is not in the RecallReady catalog.';
  if (drills.length) return `No open recall covers it. Only a mock recall (a test): ${drills.map((c) => c.issueKey).join(', ')}. Keep selling it as normal.`;
  return 'No open recall covers it.';
}

// Open cases that already cover any of these lots. A real recall is blocked only by real recalls
// (a running test must never delay one); a mock recall is blocked by any open case.
export function overlappingCases(openCases, lotKeys, drill) {
  const wanted = new Set(lotKeys || []);
  return (openCases || []).filter((c) => (drill || !c.drill) && (c.lotKeys || []).some((k) => wanted.has(k)));
}
