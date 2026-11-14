// The RecallReady catalog in Assets: object types, attributes, and how AQL results map back
// to plain catalog objects. Pure (no Forge imports).

export const SCHEMA_NAME = 'RecallReady catalog';
export const SCHEMA_KEY = 'RRC';

// Attribute kinds use the codes verified on a live site (2026-11-14):
// type 0 + defaultTypeId 0 Text, 1 Integer, 4 Date, 8 Email, 10 Select; type 1 = reference.
export const SCHEMA_SPEC = {
  Product: [
    { name: 'Brand', kind: 'text' },
    { name: 'SKU', kind: 'text' },
    { name: 'GTIN', kind: 'text' },
    { name: 'Category', kind: 'select', options: ['Food', 'Baby', 'Household', 'Toys', 'Small appliances', 'Other'] },
    { name: 'Supplier', kind: 'text' },
  ],
  Location: [
    { name: 'Type', kind: 'select', options: ['Store', 'Warehouse', 'Online', 'Seller'] },
    { name: 'Region', kind: 'text' },
  ],
  Lot: [
    { name: 'Product', kind: 'ref', ref: 'Product' },
    { name: 'Best by', kind: 'date' },
  ],
  Stock: [
    { name: 'Lot', kind: 'ref', ref: 'Lot' },
    { name: 'Location', kind: 'ref', ref: 'Location' },
    { name: 'Units', kind: 'integer' },
  ],
  Order: [
    { name: 'Lot', kind: 'ref', ref: 'Lot' },
    { name: 'Units', kind: 'integer' },
    { name: 'Customer', kind: 'text' },
    { name: 'Customer email', kind: 'email' },
    { name: 'Ordered at', kind: 'date' },
  ],
};

// Referenced types must exist before the types that point at them.
export const TYPE_ORDER = ['Product', 'Location', 'Lot', 'Stock', 'Order'];

export const DEFAULT_TYPE_IDS = { text: 0, integer: 1, date: 4, email: 8, select: 10 };

// Assets attribute name -> catalog field, per object type. "Name" is each type's label.
export const FIELD_MAP = {
  Product: { Name: 'name', Brand: 'brand', SKU: 'sku', GTIN: 'gtin', Category: 'category', Supplier: 'supplier' },
  Location: { Name: 'name', Type: 'type', Region: 'region' },
  Lot: { Name: 'code', Product: 'productKey', 'Best by': 'bestBy' },
  Stock: { Lot: 'lotKey', Location: 'locationKey', Units: 'units' },
  Order: { Name: 'orderNumber', Lot: 'lotKey', Units: 'units', Customer: 'customerName', 'Customer email': 'customerEmail', 'Ordered at': 'orderedAt' },
};
const NUMBER_FIELDS = new Set(['units']);

export function mapAqlObjects(response, typeName) {
  const fields = FIELD_MAP[typeName];
  const nameById = Object.fromEntries((response.objectTypeAttributes || []).map((a) => [String(a.id), a.name]));
  return (response.values || []).map((object) => {
    const out = { key: object.objectKey };
    for (const field of Object.values(fields)) out[field] = NUMBER_FIELDS.has(field) ? 0 : '';
    for (const attribute of object.attributes || []) {
      const field = fields[nameById[String(attribute.objectTypeAttributeId)]];
      if (!field) continue;
      const first = (attribute.objectAttributeValues || [])[0];
      if (!first) continue;
      const value = first.referencedObject ? first.referencedObject.objectKey : first.value;
      out[field] = NUMBER_FIELDS.has(field) ? Number(value) || 0 : String(value ?? '');
    }
    return out;
  });
}
