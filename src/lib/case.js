// The recall case: what is affected, where it is, who confirmed what, and the records a
// recall team needs (customer notice, regulator summary, closing record). Pure functions;
// every update returns a new object.
import { clockStatus } from './clocks.js';

export const DEFAULT_PLAN = [
  { key: 'stopSale', label: 'Stop sale at every location', hours: 4 },
  { key: 'customerNotice', label: 'Customer notice ready', hours: 24 },
  { key: 'regulatorSummary', label: 'Regulator summary ready', hours: 24 },
  { key: 'effectiveness', label: 'Effectiveness check', hours: 168 },
];

const MILESTONE_LABELS = { closed: 'Recall closed' };
const percentText = (n) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
const timeText = (iso) => (iso ? `${String(iso).slice(0, 16).replace('T', ' ')} UTC` : 'not yet');

export function buildCase({ notice, matches, catalog, plan = DEFAULT_PLAN, now, drill = false }) {
  const lotKeys = new Set(matches.flatMap((m) => m.lotKeys));
  const productKeys = new Set(matches.map((m) => m.productKey));
  const lots = (catalog.lots || []).filter((l) => lotKeys.has(l.key));
  const lotCode = Object.fromEntries(lots.map((l) => [l.key, l.code]));

  const byLocation = new Map();
  for (const row of catalog.stock || []) {
    if (!lotKeys.has(row.lotKey) || !(Number(row.units) > 0)) continue;
    const entry = byLocation.get(row.locationKey) || { units: 0, lotUnits: [] };
    entry.units += Number(row.units);
    entry.lotUnits.push({ lotKey: row.lotKey, code: lotCode[row.lotKey], units: Number(row.units) });
    byLocation.set(row.locationKey, entry);
  }
  const locations = (catalog.locations || [])
    .filter((loc) => byLocation.has(loc.key))
    .map((loc) => ({
      key: loc.key,
      name: loc.name,
      type: loc.type,
      expectedUnits: byLocation.get(loc.key).units,
      lotUnits: byLocation.get(loc.key).lotUnits,
      confirmedUnits: null,
      confirmedBy: null,
      confirmedAt: null,
      note: '',
      overRecovered: false,
      subtaskKey: null,
    }));

  return {
    version: 1,
    drill: Boolean(drill),
    notice: { source: notice.source, id: notice.id, title: notice.title, firm: notice.firm, date: notice.date, url: notice.url, reason: notice.reason },
    startedAt: now,
    plan,
    products: (catalog.products || []).filter((p) => productKeys.has(p.key)).map((p) => ({ key: p.key, name: p.name, gtin: p.gtin, brand: p.brand })),
    lots: lots.map((l) => ({ key: l.key, code: l.code, productKey: l.productKey, bestBy: l.bestBy })),
    locations,
    orders: (catalog.orders || [])
      .filter((o) => lotKeys.has(o.lotKey))
      .map((o) => ({ key: o.key, orderNumber: o.orderNumber, units: Number(o.units), customerName: o.customerName, customerEmail: o.customerEmail, lotCode: lotCode[o.lotKey] })),
    milestones: { stopSale: null, customerNotice: null, regulatorSummary: null, effectiveness: null, closed: null },
    audit: [{ at: now, by: 'RecallReady', event: `${drill ? 'Mock recall' : 'Recall'} opened from ${notice.source} ${notice.id}` }],
  };
}

export function confirmLocation(caseData, { locationKey, units, by, at, note }) {
  const count = Number(units);
  if (!Number.isFinite(count) || count < 0) throw new Error('Units must be 0 or more');
  const target = caseData.locations.find((l) => l.key === locationKey);
  if (!target) throw new Error('Unknown location for this recall');
  const locations = caseData.locations.map((l) => (l.key === locationKey
    ? { ...l, confirmedUnits: count, confirmedBy: by, confirmedAt: at, note: note || '', overRecovered: count > l.expectedUnits }
    : l));
  const audit = [...caseData.audit, { at, by, event: `${by} confirmed ${count} of ${target.expectedUnits} units pulled at ${target.name}` }];
  let next = { ...caseData, locations, audit };
  if (!next.milestones.stopSale && locations.every((l) => l.confirmedUnits !== null)) {
    next = { ...next, milestones: { ...next.milestones, stopSale: at }, audit: [...next.audit, { at, by: 'RecallReady', event: 'Stop sale confirmed at every location' }] };
  }
  return next;
}

export function markMilestone(caseData, key, at, by) {
  if (caseData.milestones[key]) return caseData;
  const label = (caseData.plan.find((p) => p.key === key) || {}).label || MILESTONE_LABELS[key] || key;
  return {
    ...caseData,
    milestones: { ...caseData.milestones, [key]: at },
    audit: [...caseData.audit, { at, by, event: `${label}` }],
  };
}

export function caseSummary(caseData, now) {
  const expectedUnits = caseData.locations.reduce((s, l) => s + l.expectedUnits, 0);
  const recoveredUnits = caseData.locations.reduce((s, l) => s + (l.confirmedUnits || 0), 0);
  const locationsTotal = caseData.locations.length;
  const locationsConfirmed = caseData.locations.filter((l) => l.confirmedUnits !== null).length;
  const clocks = clockStatus(caseData.startedAt, caseData.plan, caseData.milestones, now);
  const open = clocks.filter((c) => c.status !== 'met').sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return {
    expectedUnits,
    recoveredUnits,
    locationsTotal,
    locationsConfirmed,
    percent: locationsTotal ? Math.round((locationsConfirmed / locationsTotal) * 100) : 0,
    effectiveness: expectedUnits ? Math.round((recoveredUnits / expectedUnits) * 1000) / 10 : 0,
    clocks,
    nextClock: open[0] || null,
  };
}

const productLine = (c) => c.products.map((p) => `${p.name}${p.gtin ? ` (GTIN ${p.gtin})` : ''}`).join('; ');
const lotLine = (c) => c.lots.map((l) => l.code).join(', ');

export function closingRecord(caseData, now) {
  const s = caseSummary(caseData, now);
  const lines = [
    `RecallReady closing record${caseData.drill ? ' (mock recall)' : ''}`,
    `Recall: ${caseData.notice.title} (${caseData.notice.source} ${caseData.notice.id})`,
    `Opened: ${timeText(caseData.startedAt)}. Closed: ${timeText(now)}.`,
    `Products: ${productLine(caseData)}`,
    `Lots: ${lotLine(caseData)}`,
    `Locations: ${s.locationsConfirmed} of ${s.locationsTotal} confirmed`,
    `Units: ${s.recoveredUnits} recovered of ${s.expectedUnits} expected. Effectiveness ${percentText(s.effectiveness)}`,
  ];
  const over = caseData.locations.filter((l) => l.overRecovered);
  if (over.length) lines.push(`More units pulled than expected at: ${over.map((l) => `${l.name} (${l.confirmedUnits} of ${l.expectedUnits})`).join(', ')}`);
  lines.push(`Customers to notify: ${caseData.orders.length} order${caseData.orders.length === 1 ? '' : 's'}`);
  lines.push('Response plan:');
  for (const c of s.clocks) lines.push(`- ${c.label} (target ${c.hours} h): ${c.status === 'met' ? `met at ${timeText(c.metAt)}` : c.status === 'overdue' ? 'missed' : 'not met yet'}`);
  lines.push('Timeline:');
  for (const a of caseData.audit) lines.push(`- ${timeText(a.at)} ${a.event}`);
  return lines.join('\n');
}

export function customerNotice(caseData, company) {
  const lots = lotLine(caseData);
  const products = caseData.products.map((p) => p.name).join(', ');
  return [
    `Subject: Important recall notice: ${products}`,
    '',
    'Dear customer,',
    '',
    `Our records show that you bought ${products} from ${company}. The product is being recalled. Affected lot${caseData.lots.length === 1 ? '' : 's'}: ${lots}.`,
    caseData.notice.reason ? `Reason for the recall: ${caseData.notice.reason}` : '',
    '',
    'Please stop using the product. Check the lot code on the package. If it matches, return the product to any of our stores or reply to this message for a full refund.',
    '',
    `We are sorry for the inconvenience. ${company}`,
  ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n');
}

export function regulatorSummary(caseData) {
  const s = caseSummary(caseData, caseData.startedAt);
  return [
    `Recall summary for regulator report${caseData.drill ? ' (mock recall, not for submission)' : ''}`,
    `Source: ${caseData.notice.source} ${caseData.notice.id}${caseData.notice.url ? ` (${caseData.notice.url})` : ''}`,
    caseData.notice.firm ? `Recalling firm: ${caseData.notice.firm}` : '',
    `Products: ${productLine(caseData)}`,
    `Lots: ${lotLine(caseData)}`,
    caseData.notice.reason ? `Reason: ${caseData.notice.reason}` : '',
    `Distribution: ${s.expectedUnits} units at ${s.locationsTotal} location${s.locationsTotal === 1 ? '' : 's'} (${caseData.locations.map((l) => `${l.name} ${l.expectedUnits}`).join(', ')})`,
    `Consumers who bought affected lots online: ${caseData.orders.length}`,
    `Case opened: ${timeText(caseData.startedAt)}`,
  ].filter(Boolean).join('\n');
}

// Applies confirmations stored on stop-sale sub-tasks, oldest first. Unknown locations and
// invalid unit counts are skipped so one bad record cannot hide the rest.
export function applyConfirmations(caseData, confirmations) {
  const ordered = [...(confirmations || [])].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  let next = caseData;
  for (const confirmation of ordered) {
    try {
      next = confirmLocation(next, confirmation);
    } catch {
      // skipped on purpose
    }
  }
  return next;
}

const lotsText = (codes) => `${codes.length === 1 ? 'lot' : 'lots'} ${codes.join(', ')}`;

export function caseTitle(caseData) {
  const names = caseData.products.map((p) => p.name).join(', ');
  return `${caseData.drill ? 'Mock recall' : 'Recall'}: ${names} (${lotsText(caseData.lots.map((l) => l.code))})`.slice(0, 250);
}

export function stopSaleTitle(location) {
  const codes = [...new Set((location.lotUnits || []).map((l) => l.code))];
  return `Stop sale: pull ${location.expectedUnits} units of ${lotsText(codes)} at ${location.name}`.slice(0, 250);
}
