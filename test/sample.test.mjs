import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE, SAMPLE_COMPANY, FICTIONAL_BRANDS } from '../src/lib/sample.js';
import { normalizeGtin } from '../src/lib/ids.js';

test('company and sizes', () => {
  assert.equal(SAMPLE_COMPANY, 'Larkmere Market');
  assert.equal(SAMPLE.products.length, 24);
  assert.equal(SAMPLE.locations.length, 10);
  assert.deepEqual(['Store', 'Warehouse', 'Online'].map((t) => SAMPLE.locations.filter((l) => l.type === t).length), [8, 1, 1]);
  assert.equal(SAMPLE.orders.length, 40);
});

test('every GTIN is valid and in the restricted 02 range', () => {
  for (const p of SAMPLE.products) {
    assert.equal(normalizeGtin(p.gtin), p.gtin, p.name);
    assert.ok(p.gtin.startsWith('02'), p.gtin);
  }
});

test('every product has 2 or 3 lots and every lot points to a product', () => {
  const products = new Set(SAMPLE.products.map((p) => p.key));
  for (const l of SAMPLE.lots) assert.ok(products.has(l.productKey), l.key);
  for (const p of SAMPLE.products) {
    const n = SAMPLE.lots.filter((l) => l.productKey === p.key).length;
    assert.ok(n >= 2 && n <= 3, `${p.key} has ${n} lots`);
  }
});

test('stock and orders reference real lots and locations with positive units', () => {
  const lots = new Set(SAMPLE.lots.map((l) => l.key));
  const locations = new Set(SAMPLE.locations.map((l) => l.key));
  for (const s of SAMPLE.stock) {
    assert.ok(lots.has(s.lotKey) && locations.has(s.locationKey), s.key);
    assert.ok(s.units > 0, s.key);
  }
  for (const o of SAMPLE.orders) {
    assert.ok(lots.has(o.lotKey), o.key);
    assert.ok(o.units > 0 && o.customerEmail.endsWith('@example.com'), o.key);
  }
});

test('names are unique and brands are the fictional list', () => {
  assert.equal(new Set(SAMPLE.products.map((p) => p.name)).size, 24);
  for (const p of SAMPLE.products) assert.ok(FICTIONAL_BRANDS.includes(p.brand), p.brand);
});

test('the demo product has stock at several locations and online orders', () => {
  const lot = SAMPLE.lots.find((l) => l.productKey === 'P01');
  const rows = SAMPLE.stock.filter((s) => s.lotKey === lot.key);
  assert.ok(rows.length >= 5);
  assert.ok(SAMPLE.orders.filter((o) => o.lotKey === lot.key).length >= 3);
});
