// App settings and small state in Forge Key-Value Storage.
import { kvs } from '@forge/kvs';
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
