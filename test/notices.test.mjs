import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromFda, fromCpsc, fromText, noticeRef, noticeHeadline } from '../src/lib/notices.js';

const fda = JSON.parse(readFileSync(new URL('./fixtures/fda-food.json', import.meta.url)));
const cpsc = JSON.parse(readFileSync(new URL('./fixtures/cpsc.json', import.meta.url)));

test('FDA enforcement record becomes a notice', () => {
  const n = fromFda(fda, 'food');
  assert.equal(n.source, 'FDA food');
  assert.equal(n.id, 'FDA:H-0184-2027');
  assert.equal(n.date, '2026-11-04');
  assert.equal(n.classification, 'Class I');
  assert.ok(n.lots.includes('260417'));
  assert.ok(n.lots.includes('260617'));
  assert.equal(n.firm, 'GF Blends Inc');
  assert.match(n.productText, /Rustic Bread Mix/);
  assert.equal(n.url, 'https://api.fda.gov/food/enforcement.json?search=recall_number:"H-0184-2027"');
});

test('CPSC recall becomes a notice', () => {
  const n = fromCpsc(cpsc);
  assert.equal(n.source, 'CPSC');
  assert.equal(n.id, 'CPSC:27082');
  assert.equal(n.date, '2026-11-12');
  assert.ok(n.title.startsWith('Allstar Recalls'));
  assert.equal(n.url, cpsc.URL);
  assert.match(n.firm, /^Allstar Marketing Group/);
  assert.match(n.productText, /Tabletop Fire Pits/);
  assert.deepEqual(n.gtins, []);
});

test('pasted text becomes a notice with a stable id', () => {
  const a = fromText('Recall of Lot 24B17 GTIN 2001234567893');
  const b = fromText('Recall of Lot 24B17 GTIN 2001234567893');
  assert.equal(a.source, 'Text');
  assert.deepEqual(a.gtins, ['02001234567893']);
  assert.deepEqual(a.lots, ['24B17']);
  assert.match(a.id, /^TEXT:[0-9a-f]{12}$/);
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, fromText('Something else').id);
});

test('notice reference names the source in words, never an internal id', () => {
  assert.equal(noticeRef(fromFda(fda, 'food')), 'FDA food recall H-0184-2027');
  assert.equal(noticeRef(fromCpsc(cpsc)), 'CPSC recall 27082');
  assert.equal(noticeRef(fromText('Recall of lot 24B17')), 'pasted notice text');
  assert.equal(noticeRef({ source: 'Mock recall', id: 'DRILL:20261114064206' }), 'mock recall');
});

test('notice headline does not repeat a source the title already names', () => {
  assert.equal(noticeHeadline({ source: 'Mock recall', title: 'Mock recall of Larkmere Creamy Peanut Butter 16 oz' }), 'Mock recall of Larkmere Creamy Peanut Butter 16 oz');
  assert.equal(noticeHeadline({ source: 'FDA food', title: 'Rustic Bread Mix' }), 'FDA food: Rustic Bread Mix');
  assert.equal(noticeHeadline({ source: 'Text', title: 'Supplier email' }), 'Pasted notice: Supplier email');
});

test('a long pasted notice gets a title cut at a word, marked with dots', () => {
  const text = 'Quillbrook Farms is recalling Larkmere Creamy Peanut Butter 16 oz, lot 26J10A, because it may contain undeclared tree nuts (almonds).';
  const { title } = fromText(text);
  assert.ok(title.length <= 123, title);
  assert.ok(title.endsWith('...'), title);
  const kept = title.slice(0, -3);
  assert.ok(text.startsWith(kept), title);
  assert.equal(text[kept.length], ' ', `cut inside a word: ${title}`);
  assert.equal(fromText('Lot 24B17 recalled').title, 'Lot 24B17 recalled');
});
