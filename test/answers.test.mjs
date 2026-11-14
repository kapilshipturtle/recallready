import test from 'node:test';
import assert from 'node:assert/strict';
import { productAnswer, overlappingCases } from '../src/lib/answers.js';

const product = { key: 'P1', name: 'Larkmere Creamy Peanut Butter 16 oz' };
const real = { issueKey: 'REC-1', drill: false, lots: ['26J10A'], lotKeys: ['L2'] };
const drill = { issueKey: 'REC-2', drill: true, lots: ['26I01A'], lotKeys: ['L1'] };

test('an open real recall means do not sell', () => {
  assert.match(productAnswer({ products: [product], lots: [], openCases: [real], complete: true }), /^Yes\. Open recall: REC-1 \(lots 26J10A\)\. Do not sell or ship it\.$/);
});

test('a mock recall alone never stops a sale', () => {
  const a = productAnswer({ products: [product], lots: [], openCases: [drill], complete: true });
  assert.match(a, /^No open recall covers it\./);
  assert.match(a, /mock recall \(a test\): REC-2/);
});

test('no answer is given when not every open recall could be read', () => {
  assert.match(productAnswer({ products: [product], lots: [], openCases: [], complete: false }), /^Could not check every open recall/);
});

test('not in the catalog, and no recall', () => {
  assert.equal(productAnswer({ products: [], lots: [], openCases: [], complete: true }), 'It is not in the RecallReady catalog.');
  assert.equal(productAnswer({ products: [product], lots: [], openCases: [], complete: true }), 'No open recall covers it.');
});

test('a real recall is blocked only by real open recalls on the same lots; a mock recall by any', () => {
  assert.deepEqual(overlappingCases([real, drill], ['L2', 'L9'], false).map((c) => c.issueKey), ['REC-1']);
  assert.deepEqual(overlappingCases([drill], ['L1'], false), []);
  assert.deepEqual(overlappingCases([real, drill], ['L1'], true).map((c) => c.issueKey), ['REC-2']);
});
