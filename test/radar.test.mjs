import test from 'node:test';
import assert from 'node:assert/strict';
import { planScan, mergeSeen, windowStart, boundReviewItem } from '../src/lib/radar.js';
import { fromText } from '../src/lib/notices.js';

const catalog = {
  products: [
    { key: 'P1', name: 'Larkmere Creamy Peanut Butter 16 oz', brand: 'Larkmere', sku: 'LM-PB16C', gtin: '02000000000015' },
    { key: 'P2', name: 'Brightkettle Hot Air Popcorn Maker', brand: 'Brightkettle', sku: 'BK-PM200', gtin: '' },
  ],
  lots: [{ key: 'L1', code: '26I01A', productKey: 'P1' }, { key: 'L2', code: '26J10B', productKey: 'P2' }],
  locations: [], stock: [], orders: [],
};
const high = { ...fromText('Recall of GTIN 2000000000015 all lots'), id: 'FDA:H-1' };
const medium = { ...fromText('Brightkettle Hot Air Popcorn Maker recalled for burn hazard'), id: 'CPSC:100' };
const none = { ...fromText('Unrelated garden hose recall'), id: 'CPSC:101' };

test('High matches open a case, Medium and Low go to review, no-match notices are not remembered', () => {
  const plan = planScan({ notices: [high, medium, none], catalog, seenIds: [] });
  assert.deepEqual(plan.open.map((o) => [o.notice.id, o.matches.map((m) => m.productKey)]), [['FDA:H-1', ['P1']]]);
  assert.deepEqual(plan.queue.map((q) => [q.notice.id, q.matches.map((m) => m.confidence)]), [['CPSC:100', ['Medium']]]);
  assert.deepEqual(plan.seen, ['FDA:H-1', 'CPSC:100']);
});

test('notices handled before are skipped', () => {
  const plan = planScan({ notices: [high, medium], catalog, seenIds: ['FDA:H-1'] });
  assert.deepEqual(plan.open, []);
  assert.equal(plan.queue.length, 1);
  assert.deepEqual(plan.seen, ['CPSC:100']);
});

test('the same notice twice in one run is handled once', () => {
  const plan = planScan({ notices: [high, { ...high }], catalog, seenIds: [] });
  assert.equal(plan.open.length, 1);
  assert.deepEqual(plan.seen, ['FDA:H-1']);
});

test('seen ids keep the newest and stay bounded', () => {
  const merged = mergeSeen(['a', 'b', 'c'], ['c', 'd'], 3);
  assert.deepEqual(merged, ['b', 'c', 'd']);
});

test('every scan looks back 30 days, so FDA batches published late are still read', () => {
  assert.equal(windowStart('2026-11-14T10:00:00Z'), '2026-10-15');
  assert.equal(windowStart('2026-11-21T01:00:00Z'), '2026-10-22');
});

test('a notice that matched nothing is matched again on the next scan', () => {
  const first = planScan({ notices: [none], catalog, seenIds: [] });
  assert.deepEqual(first.seen, []);
  const withProduct = { ...catalog, products: [...catalog.products, { key: 'P9', name: 'Larkmere Garden Hose 50 ft', brand: 'Larkmere', sku: 'LM-GH50', gtin: '' }] };
  const later = planScan({ notices: [{ ...fromText('Larkmere garden hose recall'), id: 'CPSC:102' }], catalog: withProduct, seenIds: first.seen });
  assert.equal(later.queue.length, 1);
});

test('review items stay small even for a store brand with many products', () => {
  const big = {
    notice: { ...fromText('x'.repeat(5000)), lots: Array.from({ length: 500 }, (_, i) => `L${i}X`), gtins: Array.from({ length: 300 }, () => '02000000000015'), reason: 'r'.repeat(5000) },
    matches: Array.from({ length: 1000 }, (_, i) => ({ productKey: `P${i}`, confidence: i < 30 ? 'Medium' : 'Low', score: 0.1, lotKeys: ['L1', 'L2', 'L3'], evidence: ['Brand "Larkmere" is named in the notice', '0 of 3 product words found in the notice (0%)'], productName: `Larkmere product ${i}`, lotCodes: ['26I01A', '26J10A', '26K19A'] })),
    addedAt: '2026-11-14T10:00:00Z',
  };
  const bounded = boundReviewItem(big);
  assert.ok(JSON.stringify(bounded).length < 20000, String(JSON.stringify(bounded).length));
  assert.equal(bounded.totalMatches, 1000);
  assert.ok(bounded.matches.length <= 30);
});

import { cleanCpsc } from '../src/lib/radar.js';

test('CPSC error rows (RecallID 0) become an error, not a notice', () => {
  const out = cleanCpsc([{ RecallID: 0, RecallNumber: null, Title: 'Error retrieving Recalls: The underlying provider failed on Open.' }]);
  assert.deepEqual(out.records, []);
  assert.match(out.error, /provider failed/);
});

test('real CPSC rows pass through', () => {
  const out = cleanCpsc([{ RecallID: 11234, RecallNumber: '27082', Title: 'Allstar Recalls fire pits' }]);
  assert.equal(out.records.length, 1);
  assert.equal(out.error, '');
});
