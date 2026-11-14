import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PLAN, buildCase, confirmLocation, markMilestone, caseSummary, closingRecord, customerNotice, regulatorSummary } from '../src/lib/case.js';

const catalog = {
  products: [{ key: 'P1', name: 'Harbor Lane Creamy Peanut Butter 16 oz', brand: 'Harbor Lane', sku: 'HL-PB-16', gtin: '02001234567893' }],
  lots: [{ key: 'LA', code: '24B17', productKey: 'P1', bestBy: '2027-04-17' }, { key: 'LB', code: '24B18', productKey: 'P1', bestBy: '2027-04-18' }],
  locations: [
    { key: 'S12', name: 'Store 12', type: 'Store', region: 'North' },
    { key: 'DC1', name: 'DC 1', type: 'Warehouse', region: 'Central' },
    { key: 'S5', name: 'Store 5', type: 'Store', region: 'South' },
  ],
  stock: [
    { key: 'K1', lotKey: 'LA', locationKey: 'S12', units: 36 },
    { key: 'K2', lotKey: 'LA', locationKey: 'DC1', units: 12 },
    { key: 'K3', lotKey: 'LB', locationKey: 'S5', units: 10 },
    { key: 'K4', lotKey: 'LA', locationKey: 'S5', units: 0 },
  ],
  orders: [
    { key: 'O1', orderNumber: 'HL-10001', lotKey: 'LA', units: 1, customerName: 'Ana Ruiz', customerEmail: 'ana@example.com', orderedAt: '2026-11-01' },
    { key: 'O2', orderNumber: 'HL-10002', lotKey: 'LB', units: 2, customerName: 'Ben Ito', customerEmail: 'ben@example.com', orderedAt: '2026-11-02' },
  ],
};
const notice = { source: 'Text', id: 'TEXT:abc', title: 'Creamy peanut butter lot 24B17', firm: 'Coastal Foods', date: '', url: '', reason: 'Possible Salmonella', classification: '', productText: '', codeText: '', gtins: [], lots: ['24B17'], models: [] };
const matches = [{ productKey: 'P1', confidence: 'High', score: 0.9, lotKeys: ['LA'], evidence: [] }];
const T0 = '2026-11-14T10:00:00.000Z';
const hours = (h) => new Date(Date.parse(T0) + h * 3600e3).toISOString();
const fresh = () => buildCase({ notice, matches, catalog, plan: DEFAULT_PLAN, now: T0, drill: false });

test('expected units come from stock of matched lots, zero rows excluded', () => {
  const c = fresh();
  assert.deepEqual(c.locations.map((l) => [l.key, l.expectedUnits]), [['S12', 36], ['DC1', 12]]);
  assert.equal(c.locations[0].confirmedUnits, null);
  assert.equal(c.startedAt, T0);
  assert.equal(c.version, 1);
});

test('orders are those on matched lots', () => {
  assert.deepEqual(fresh().orders.map((o) => o.orderNumber), ['HL-10001']);
});

test('negative units are rejected', () => {
  assert.throws(() => confirmLocation(fresh(), { locationKey: 'S12', units: -1, by: 'Mia', at: hours(1), note: '' }), /Units must be 0 or more/);
});

test('over-recovery is flagged, not rejected', () => {
  const c = confirmLocation(fresh(), { locationKey: 'DC1', units: 14, by: 'Mia', at: hours(1), note: '2 found in returns cage' });
  const dc = c.locations.find((l) => l.key === 'DC1');
  assert.equal(dc.confirmedUnits, 14);
  assert.equal(dc.overRecovered, true);
});

test('stop sale milestone is set when the last location confirms', () => {
  let c = confirmLocation(fresh(), { locationKey: 'S12', units: 36, by: 'Mia', at: hours(1), note: '' });
  assert.equal(c.milestones.stopSale, null);
  c = confirmLocation(c, { locationKey: 'DC1', units: 12, by: 'Raj', at: hours(2), note: '' });
  assert.equal(c.milestones.stopSale, hours(2));
});

test('summary effectiveness is rounded to one decimal', () => {
  const c = confirmLocation(fresh(), { locationKey: 'S12', units: 35, by: 'Mia', at: hours(1), note: '' });
  const s = caseSummary(c, hours(1));
  assert.equal(s.expectedUnits, 48);
  assert.equal(s.recoveredUnits, 35);
  assert.equal(s.locationsConfirmed, 1);
  assert.equal(s.locationsTotal, 2);
  assert.equal(s.percent, 50);
  assert.equal(s.effectiveness, 72.9);
  assert.equal(s.nextClock.key, 'stopSale');
});

test('milestones are recorded once with an audit entry', () => {
  let c = markMilestone(fresh(), 'customerNotice', hours(3), 'Mia');
  c = markMilestone(c, 'customerNotice', hours(5), 'Raj');
  assert.equal(c.milestones.customerNotice, hours(3));
  assert.ok(c.audit.some((a) => a.event.includes('Customer notice ready')));
});

test('closing record is plain text with product, lots and effectiveness', () => {
  let c = confirmLocation(fresh(), { locationKey: 'S12', units: 36, by: 'Mia', at: hours(1), note: '' });
  c = confirmLocation(c, { locationKey: 'DC1', units: 12, by: 'Raj', at: hours(2), note: '' });
  const text = closingRecord(c, hours(30));
  assert.match(text, /Harbor Lane Creamy Peanut Butter 16 oz/);
  assert.match(text, /24B17/);
  assert.match(text, /Effectiveness 100%/);
  assert.ok(!text.includes('**'));
});

test('customer notice and regulator summary carry the facts', () => {
  const c = fresh();
  const n = customerNotice(c, 'Harbor Lane Market');
  assert.match(n, /Harbor Lane Market/);
  assert.match(n, /24B17/);
  assert.match(n, /Possible Salmonella/);
  assert.ok(!n.includes('**'));
  const r = regulatorSummary(c);
  assert.match(r, /48 units/);
  assert.match(r, /2 locations/);
});
