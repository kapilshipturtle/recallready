import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGtin, gtinCheckDigitOk, extractGtins, extractLots, normalizeModel, extractModels } from '../src/lib/ids.js';

test('UPC-A pads to GTIN-14', () => assert.equal(normalizeGtin('012345678905'), '00012345678905'));
test('bad check digit is null', () => assert.equal(normalizeGtin('012345678904'), null));
test('check digit helper agrees', () => {
  assert.equal(gtinCheckDigitOk('02001234567893'), true);
  assert.equal(gtinCheckDigitOk('02001234567892'), false);
});
test('spaced and dashed UPC in text', () => assert.deepEqual(extractGtins('UPC 2 001234 56789 3 and EAN 2-0012345-6789-3'), ['02001234567893']));
test('phone numbers are not GTINs', () => assert.deepEqual(extractGtins('Call 1-800-555-0123 for a refund'), []));
test('FDA code_info lots', () => assert.deepEqual(extractLots('Lot 260417, Best By date 4-17-28 Lot 260617, Best By date 12-17-27'), ['260417', '260617']));
test('lot list forms', () => assert.deepEqual(extractLots('Lot #: 24B17, 24B18 and 24C01; Batch No. AX-77'), ['24B17', '24B18', '24C01', 'AX-77']));
test('dates are not lots', () => {
  assert.deepEqual(extractLots('Best by 12/17/27'), []);
  assert.deepEqual(extractLots('Lot 12-17-27'), []);
});
test('lots are uppercased and unique', () => assert.deepEqual(extractLots('lot ab12c, lot AB12C'), ['AB12C']));
test('model normalize', () => assert.equal(normalizeModel('fp-2000 x'), 'FP2000X'));

test('13-digit GTINs printed with spaces are read whole, not as a shorter valid prefix', () => {
  const granola = extractGtins('UPC 2 000000 00004 6');
  assert.ok(granola.includes('02000000000046'), granola.join());
  assert.ok(!granola.includes('00200000000004'), granola.join());
  assert.ok(extractGtins('UPC 2 000000 00011 4').includes('02000000000114'));
});
test('model numbers are read after model, item or SKU and must contain a digit', () => {
  assert.deepEqual(extractModels('Brightkettle recalls model BK-AF400 air fryer'), ['BKAF400']);
  assert.deepEqual(extractModels('Model No. FP-2000X and item # 55-210; SKU: QF-BM14'), ['FP2000X', '55210', 'QFBM14']);
  assert.deepEqual(extractModels('a model citizen and an item of note'), []);
});
