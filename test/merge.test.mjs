import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCase, applyConfirmations, caseTitle, stopSaleTitle } from '../src/lib/case.js';

const catalog = {
  products: [{ key: 'P1', name: 'Larkmere Creamy Peanut Butter 16 oz', brand: 'Larkmere', sku: 'LM-PB16C', gtin: '02000000000015' }],
  lots: [{ key: 'LA', code: '26I01A', productKey: 'P1', bestBy: '2027-06-28' }],
  locations: [{ key: 'S1', name: 'Riverside', type: 'Store' }, { key: 'W1', name: 'Distribution Centre', type: 'Warehouse' }],
  stock: [{ key: 'K1', lotKey: 'LA', locationKey: 'S1', units: 36 }, { key: 'K2', lotKey: 'LA', locationKey: 'W1', units: 48 }],
  orders: [],
};
const notice = { source: 'Mock recall', id: 'DRILL:1', title: 'Mock recall', firm: '', date: '', url: '', reason: 'Annual recall test' };
const base = () => buildCase({ notice, matches: [{ productKey: 'P1', lotKeys: ['LA'] }], catalog, now: '2026-11-14T10:00:00.000Z', drill: true });

test('confirmations from sub-tasks are applied in time order', () => {
  const merged = applyConfirmations(base(), [
    { locationKey: 'W1', units: 48, by: 'Raj', at: '2026-11-14T12:00:00.000Z', note: '' },
    { locationKey: 'S1', units: 36, by: 'Mia', at: '2026-11-14T11:00:00.000Z', note: 'shelf cleared' },
  ]);
  assert.deepEqual(merged.locations.map((l) => l.confirmedUnits), [36, 48]);
  assert.equal(merged.milestones.stopSale, '2026-11-14T12:00:00.000Z');
});

test('unknown or invalid confirmations are skipped, not fatal', () => {
  const merged = applyConfirmations(base(), [{ locationKey: 'X9', units: 3, by: 'A', at: '2026-11-14T11:00:00.000Z' }, { locationKey: 'S1', units: -2, by: 'A', at: '2026-11-14T11:00:00.000Z' }]);
  assert.deepEqual(merged.locations.map((l) => l.confirmedUnits), [null, null]);
});

test('titles name the product, lots and location', () => {
  const c = base();
  assert.equal(caseTitle(c), 'Mock recall: Larkmere Creamy Peanut Butter 16 oz (lot 26I01A)');
  assert.equal(stopSaleTitle(c.locations[0]), 'Stop sale: pull 36 units of lot 26I01A at Riverside');
  assert.ok(caseTitle({ ...c, drill: false }).startsWith('Recall: '));
});
