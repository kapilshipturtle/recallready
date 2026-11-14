import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_SPEC, mapAqlObjects, TYPE_ORDER } from '../src/lib/assets-schema.js';

const attrs = [
  { id: '1', name: 'Key' }, { id: '2', name: 'Name' }, { id: '3', name: 'Created' },
  { id: '10', name: 'Product' }, { id: '11', name: 'Best by' },
];
const response = {
  objectTypeAttributes: attrs,
  isLast: true,
  values: [{
    objectKey: 'RRC-11',
    label: '26I01A',
    attributes: [
      { objectTypeAttributeId: '1', objectAttributeValues: [{ value: 'RRC-11', displayValue: 'RRC-11' }] },
      { objectTypeAttributeId: '2', objectAttributeValues: [{ value: '26I01A', displayValue: '26I01A' }] },
      { objectTypeAttributeId: '10', objectAttributeValues: [{ displayValue: 'Larkmere Creamy Peanut Butter 16 oz', referencedObject: { objectKey: 'RRC-10' } }] },
      { objectTypeAttributeId: '11', objectAttributeValues: [{ value: '2027-06-28', displayValue: '28/Jun/27' }] },
    ],
  }],
};

test('maps a Lot from the AQL shape, references become object keys', () => {
  assert.deepEqual(mapAqlObjects(response, 'Lot'), [{ key: 'RRC-11', code: '26I01A', productKey: 'RRC-10', bestBy: '2027-06-28' }]);
});

test('missing attributes map to empty strings and units to numbers', () => {
  const r = {
    objectTypeAttributes: [{ id: '2', name: 'Name' }, { id: '20', name: 'Units' }, { id: '21', name: 'Lot' }, { id: '22', name: 'Location' }],
    values: [{ objectKey: 'RRC-50', attributes: [
      { objectTypeAttributeId: '2', objectAttributeValues: [{ value: '26I01A at Riverside' }] },
      { objectTypeAttributeId: '20', objectAttributeValues: [{ value: '36' }] },
      { objectTypeAttributeId: '21', objectAttributeValues: [{ referencedObject: { objectKey: 'RRC-11' } }] },
    ] }],
  };
  assert.deepEqual(mapAqlObjects(r, 'Stock'), [{ key: 'RRC-50', lotKey: 'RRC-11', locationKey: '', units: 36 }]);
});

test('schema spec creates referenced types first and covers the catalog fields', () => {
  assert.deepEqual(TYPE_ORDER, ['Product', 'Location', 'Lot', 'Stock', 'Order']);
  assert.deepEqual(SCHEMA_SPEC.Lot.map((a) => a.name), ['Product', 'Best by']);
  assert.equal(SCHEMA_SPEC.Lot[0].ref, 'Product');
  assert.deepEqual(SCHEMA_SPEC.Location.find((a) => a.name === 'Type').options, ['Store', 'Warehouse', 'Online', 'Seller']);
});
