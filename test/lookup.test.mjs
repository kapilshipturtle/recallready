import test from 'node:test';
import assert from 'node:assert/strict';
import { findInCatalog } from '../src/lib/lookup.js';
import { SAMPLE } from '../src/lib/sample.js';

const names = (r) => r.products.map((p) => p.name).sort();
const codes = (r) => r.lots.map((l) => l.code).sort();

test('a product name and a lot code in one question are both found', () => {
  const r = findInCatalog('Nimbleo Plush Sleepy Bear lot 26J15T', SAMPLE);
  assert.deepEqual(codes(r), ['26J15T']);
  assert.deepEqual(names(r), ['Nimbleo Plush Sleepy Bear 12 in']);
  const pods = findInCatalog('Can we still sell Pebblewick Lavender Laundry Pods lot 26J16M?', SAMPLE);
  assert.deepEqual(codes(pods), ['26J16M']);
});

test('GTINs, SKUs and lot codes on their own are found', () => {
  assert.deepEqual(names(findInCatalog('02000000000015', SAMPLE)), ['Larkmere Creamy Peanut Butter 16 oz']);
  assert.deepEqual(names(findInCatalog('2000000000015', SAMPLE)), ['Larkmere Creamy Peanut Butter 16 oz']);
  assert.deepEqual(names(findInCatalog('LM-PB16C', SAMPLE)), ['Larkmere Creamy Peanut Butter 16 oz']);
  assert.deepEqual(codes(findInCatalog('26i01a', SAMPLE)), ['26I01A']);
});

test('a general name finds every product that has it', () => {
  assert.deepEqual(names(findInCatalog('peanut butter', SAMPLE)), ['Larkmere Creamy Peanut Butter 16 oz', 'Larkmere Crunchy Peanut Butter 16 oz']);
  assert.deepEqual(findInCatalog('garden hose', SAMPLE).products, []);
});
