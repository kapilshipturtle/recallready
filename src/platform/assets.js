// Assets REST calls. Schema changes run as the admin (asUser); the app user is not an Assets
// admin, so it gets 403 there. Reading and creating objects in that schema works asApp.
import api, { route } from '@forge/api';
import { isMissingAssets } from '../lib/errors.js';
import { SCHEMA_NAME, SCHEMA_KEY, SCHEMA_SPEC, TYPE_ORDER, DEFAULT_TYPE_IDS, mapAqlObjects } from '../lib/assets-schema.js';

export class AssetsError extends Error {
  constructor(status, body) {
    super(`Assets returned ${status}: ${String(body || '').slice(0, 200)}`);
    this.status = status;
  }
}

async function call(who, path, options = {}) {
  const client = who === 'user' ? api.asUser() : api.asApp();
  const res = await client.requestJira(path, {
    ...options,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new AssetsError(res.status, text);
  return text ? JSON.parse(text) : null;
}

export async function getWorkspaceId(who = 'app') {
  try {
    const data = await call(who, route`/rest/servicedeskapi/assets/workspace`);
    return data?.values?.[0]?.workspaceId || null;
  } catch (error) {
    if (isMissingAssets(error)) return null;
    throw error;
  }
}

function attributeBody(spec, typeIds, referenceTypeId) {
  if (spec.kind === 'ref') {
    return { name: spec.name, type: 1, typeValue: String(typeIds[spec.ref]), additionalValue: String(referenceTypeId) };
  }
  const body = { name: spec.name, type: 0, defaultTypeId: DEFAULT_TYPE_IDS[spec.kind] };
  if (spec.kind === 'select') body.options = spec.options.join(',');
  return body;
}

// Creates the catalog schema, or completes a partly created one. Safe to run again.
export async function ensureSchema(workspaceId) {
  const schemas = await call('user', route`/jsm/assets/workspace/${workspaceId}/v1/objectschema/list`);
  let schema = (schemas?.values || []).find((s) => s.objectSchemaKey === SCHEMA_KEY);
  if (!schema) {
    schema = await call('user', route`/jsm/assets/workspace/${workspaceId}/v1/objectschema/create`, {
      method: 'POST',
      body: JSON.stringify({ name: SCHEMA_NAME, objectSchemaKey: SCHEMA_KEY, description: 'Products, lots, locations, stock and online orders used by RecallReady' }),
    });
  }
  const schemaId = String(schema.id);
  const existing = await call('user', route`/jsm/assets/workspace/${workspaceId}/v1/objectschema/${schemaId}/objecttypes`);
  const typeIds = Object.fromEntries((existing || []).map((t) => [t.name, String(t.id)]));
  const referenceTypes = await call('user', route`/jsm/assets/workspace/${workspaceId}/v1/config/referencetype`);
  const referenceType = (referenceTypes || []).find((r) => r.name === 'Reference') || (referenceTypes || [])[0];

  const types = {};
  for (const typeName of TYPE_ORDER) {
    if (!typeIds[typeName]) {
      const created = await call('user', route`/jsm/assets/workspace/${workspaceId}/v1/objecttype/create`, {
        method: 'POST',
        body: JSON.stringify({ name: typeName, iconId: '1', objectSchemaId: schemaId }),
      });
      typeIds[typeName] = String(created.id);
    }
    const attributes = await call('user', route`/jsm/assets/workspace/${workspaceId}/v1/objecttype/${typeIds[typeName]}/attributes`);
    const attrIds = Object.fromEntries((attributes || []).map((a) => [a.name, String(a.id)]));
    for (const spec of SCHEMA_SPEC[typeName]) {
      if (attrIds[spec.name]) continue;
      const created = await call('user', route`/jsm/assets/workspace/${workspaceId}/v1/objecttypeattribute/${typeIds[typeName]}`, {
        method: 'POST',
        body: JSON.stringify(attributeBody(spec, typeIds, referenceType?.id)),
      });
      attrIds[spec.name] = String(created.id);
    }
    types[typeName] = { id: typeIds[typeName], attrs: attrIds };
  }
  return { workspaceId, schemaId, types };
}

const aqlFor = (ids, typeName) => `objectSchemaId = ${ids.schemaId} AND objectType = "${typeName}"`;

export async function loadObjects(ids, typeName, who = 'app') {
  const out = [];
  let startAt = 0;
  for (;;) {
    const page = await call(who, route`/jsm/assets/workspace/${ids.workspaceId}/v1/object/aql?startAt=${startAt}&maxResults=${500}&includeAttributes=${true}`, {
      method: 'POST',
      body: JSON.stringify({ qlQuery: aqlFor(ids, typeName) }),
    });
    const values = page?.values || [];
    out.push(...mapAqlObjects(page, typeName));
    const more = page?.hasMoreResults === true || page?.isLast === false;
    if (!more || !values.length) break;
    startAt += values.length;
  }
  return out;
}

export async function loadCatalog(ids) {
  const [products, locations, lots, stock, orders] = await Promise.all(TYPE_ORDER.map((t) => loadObjects(ids, t)));
  return { products, locations, lots, stock, orders };
}

export async function countObjects(ids, typeName) {
  const page = await call('app', route`/jsm/assets/workspace/${ids.workspaceId}/v1/object/aql?startAt=${0}&maxResults=${1}&includeAttributes=${false}`, {
    method: 'POST',
    body: JSON.stringify({ qlQuery: aqlFor(ids, typeName) }),
  });
  return Number(page?.total || 0);
}

// values: { 'Attribute name': value }. References take the target objectKey.
export async function createObject(ids, typeName, values, who = 'app') {
  const type = ids.types[typeName];
  const attributes = Object.entries(values)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([name, v]) => {
      if (!type.attrs[name]) throw new Error(`Attribute "${name}" is missing on ${typeName}. Run setup again.`);
      return { objectTypeAttributeId: type.attrs[name], objectAttributeValues: [{ value: String(v) }] };
    });
  const created = await call(who, route`/jsm/assets/workspace/${ids.workspaceId}/v1/object/create`, {
    method: 'POST',
    body: JSON.stringify({ objectTypeId: type.id, attributes }),
  });
  return created.objectKey;
}
