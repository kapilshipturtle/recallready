import test from 'node:test';
import assert from 'node:assert/strict';
import { matchNotice, nameSimilarity } from '../src/lib/match.js';
import { fromText } from '../src/lib/notices.js';

const catalog = {
  products: [
    { key: 'P1', name: 'Harbor Lane Creamy Peanut Butter 16 oz', brand: 'Harbor Lane', sku: 'HL-PB-16', gtin: '02001234567893', category: 'Food', supplier: 'Coastal Foods' },
    { key: 'P2', name: 'Brightwave Kettle Popcorn Maker', brand: 'Brightwave', sku: 'BW-PM200', gtin: '', category: 'Small appliances', supplier: 'Brightwave' },
    { key: 'P3', name: 'Organic Whole Milk 1 gal', brand: 'Meadowfield', sku: 'MF-WM1', gtin: '', category: 'Food', supplier: 'Meadowfield Dairy' },
  ],
  lots: [
    { key: 'L1a', code: '24B17', productKey: 'P1', bestBy: '2027-04-17' },
    { key: 'L1b', code: '24B18', productKey: 'P1', bestBy: '2027-04-18' },
    { key: 'L1c', code: '24C01', productKey: 'P1', bestBy: '2027-05-01' },
    { key: 'L2a', code: 'PM-0925', productKey: 'P2', bestBy: '' },
    { key: 'L3a', code: 'M1105', productKey: 'P3', bestBy: '2026-11-25' },
  ],
  locations: [], stock: [], orders: [],
};

const notice = (text) => fromText(text);

test('GTIN equality is High with evidence and all lots', () => {
  const [m] = matchNotice(notice('Recall: GTIN 2001234567893, all codes.'), catalog);
  assert.equal(m.productKey, 'P1');
  assert.equal(m.confidence, 'High');
  assert.ok(m.evidence.some((e) => e.includes('GTIN 02001234567893')));
  assert.deepEqual(m.lotKeys, ['L1a', 'L1b', 'L1c']);
});

test('model equal to SKU is High', () => {
  const n = { ...notice('Popcorn maker recall'), models: ['BWPM200'] };
  const [m] = matchNotice(n, catalog);
  assert.equal(m.productKey, 'P2');
  assert.equal(m.confidence, 'High');
});

test('brand + name + listed lots is High, scoped to those lots', () => {
  const [m] = matchNotice(notice('Harbor Lane Creamy Peanut Butter 16 oz, lots 24B17 and 24B18, possible Salmonella'), catalog);
  assert.equal(m.productKey, 'P1');
  assert.equal(m.confidence, 'High');
  assert.deepEqual(m.lotKeys, ['L1a', 'L1b']);
  assert.ok(m.evidence.some((e) => e.includes('Lot 24B17')));
});

test('brand + name without lots is Medium', () => {
  const [m] = matchNotice(notice('Harbor Lane Creamy Peanut Butter recalled'), catalog);
  assert.equal(m.confidence, 'Medium');
  assert.deepEqual(m.lotKeys, ['L1a', 'L1b', 'L1c']);
});

test('brand with a different product is Low', () => {
  const [m] = matchNotice(notice('Harbor Lane Crunchy Almond Butter recalled'), catalog);
  assert.equal(m.productKey, 'P1');
  assert.equal(m.confidence, 'Low');
});

test('shared common words without the brand never match', () => {
  assert.deepEqual(matchNotice(notice('Organic Peanut Butter recall'), catalog), []);
});

test('results are ordered High, Medium, Low', () => {
  const n = { ...notice('Harbor Lane Crunchy Almond Butter; also Brightwave Kettle Popcorn Maker model BW-PM200'), models: ['BW-PM200'] };
  const out = matchNotice(n, catalog).map((m) => m.confidence);
  assert.deepEqual(out, ['High', 'Low']);
});

test('nameSimilarity is the share of product words found', () => {
  assert.equal(nameSimilarity('Creamy Peanut Butter 16 oz', 'Gluten free creamy peanut butter spread'), 1);
  assert.equal(nameSimilarity('Organic Whole Milk', 'Organic Peanut Butter'), 1 / 3);
});
