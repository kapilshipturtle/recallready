// App settings and small state in Forge Key-Value Storage.
import { kvs, WhereConditions } from '@forge/kvs';
import { DEFAULT_PLAN } from '../lib/case.js';

export const DEFAULT_SETTINGS = {
  schemaIds: null,
  projectKey: '',
  company: '',
  plan: DEFAULT_PLAN,
  sources: { fdaFood: true, fdaDrug: true, fdaDevice: true, cpsc: true },
};

export async function getSettings() {
  const saved = (await kvs.get('settings')) || {};
  return { ...DEFAULT_SETTINGS, ...saved, sources: { ...DEFAULT_SETTINGS.sources, ...(saved.sources || {}) } };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await kvs.set('settings', next);
  return next;
}

export const getState = async (key, fallback = null) => (await kvs.get(key)) ?? fallback;
export const setState = (key, value) => kvs.set(key, value);
export const deleteState = (key) => kvs.delete(key);

// Takes a key only if nobody holds it yet (two radar runs can never both open the same case).
// Returns false when the key already exists.
export async function claimOnce(key, value) {
  try {
    await kvs.set(key, value, { keyPolicy: 'FAIL_IF_EXISTS' });
    return true;
  } catch (error) {
    const existing = await kvs.get(key).catch(() => undefined);
    if (existing !== undefined && existing !== null) return false;
    throw error;
  }
}

// Every stored value whose key starts with `prefix`, as [{ key, value }].
export async function listState(prefix, max = 100) {
  const out = [];
  let cursor;
  do {
    let query = kvs.query().where('key', WhereConditions.beginsWith(prefix)).limit(Math.min(100, max - out.length));
    if (cursor) query = query.cursor(cursor);
    const page = await query.getMany();
    out.push(...(page?.results || []));
    cursor = page?.nextCursor;
  } while (cursor && out.length < max);
  return out;
}
