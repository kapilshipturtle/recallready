// One-time setup: catalog schema in Assets (as the admin) and optional sample data (in the
// background, as the app, through the rr-sample-load queue).
import { Queue } from '@forge/events';
import { getWorkspaceId, ensureSchema, createObject, countObjects } from '../platform/assets.js';
import { getSettings, saveSettings, getState, setState } from '../platform/settings.js';
import { TYPE_ORDER } from '../lib/assets-schema.js';
import { SAMPLE, SAMPLE_COMPANY } from '../lib/sample.js';

export const NO_ASSETS = 'Assets is not available on this site. RecallReady needs Jira Service Management with Assets.';
const sampleQueue = new Queue({ key: 'rr-sample-load' });
const SAMPLE_TOTAL = SAMPLE.products.length + SAMPLE.locations.length + SAMPLE.lots.length + SAMPLE.stock.length + SAMPLE.orders.length;

export async function catalogStatus(ids) {
  if (!ids) return { ready: false, counts: null };
  const counts = {};
  for (const typeName of TYPE_ORDER) counts[typeName] = await countObjects(ids, typeName);
  return { ready: true, counts };
}

export async function runSetup({ withSample }) {
  const workspaceId = await getWorkspaceId('user');
  if (!workspaceId) return { ok: false, message: NO_ASSETS };
  const ids = await ensureSchema(workspaceId);
  await saveSettings({ schemaIds: ids });
  if (withSample) await startSampleLoad();
  return { ok: true, status: await catalogStatus(ids), sample: await getState('sample-progress') };
}

export async function startSampleLoad() {
  const settings = await getSettings();
  if (!settings.company) await saveSettings({ company: SAMPLE_COMPANY });
  await setState('sample-progress', { status: 'queued', created: 0, total: SAMPLE_TOTAL, message: '', updatedAt: new Date().toISOString() });
  await sampleQueue.push({ body: { kind: 'load-sample' } });
}

// Runs every create with at most `limit` requests in flight.
async function pool(items, limit, worker) {
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await worker(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

// Background job: creates the sample objects. Resumable: local keys already created are skipped.
export async function loadSample() {
  const { schemaIds: ids } = await getSettings();
  if (!ids) throw new Error('Run setup before loading sample data.');
  const map = (await getState('sample-map')) || {};
  let created = Object.keys(map).length;
  const progress = async (status, message = '') => setState('sample-progress', { status, created, total: SAMPLE_TOTAL, message, updatedAt: new Date().toISOString() });
  await progress('running');

  const names = Object.fromEntries(SAMPLE.locations.map((l) => [l.key, l.name]));
  const lotCode = Object.fromEntries(SAMPLE.lots.map((l) => [l.key, l.code]));
  const phases = [
    ['Product', SAMPLE.products, (p) => ({ Name: p.name, Brand: p.brand, SKU: p.sku, GTIN: p.gtin, Category: p.category, Supplier: p.supplier })],
    ['Location', SAMPLE.locations, (l) => ({ Name: l.name, Type: l.type, Region: l.region })],
    ['Lot', SAMPLE.lots, (l) => ({ Name: l.code, Product: map[l.productKey], 'Best by': l.bestBy })],
    ['Stock', SAMPLE.stock, (s) => ({ Name: `${lotCode[s.lotKey]} at ${names[s.locationKey]}`, Lot: map[s.lotKey], Location: map[s.locationKey], Units: s.units })],
    ['Order', SAMPLE.orders, (o) => ({ Name: o.orderNumber, Lot: map[o.lotKey], Units: o.units, Customer: o.customerName, 'Customer email': o.customerEmail, 'Ordered at': o.orderedAt })],
  ];
  try {
    for (const [typeName, items, values] of phases) {
      const todo = items.filter((item) => !map[item.key]);
      await pool(todo, 5, async (item) => {
        map[item.key] = await createObject(ids, typeName, values(item));
        created += 1;
        if (created % 25 === 0) {
          await setState('sample-map', map);
          await progress('running');
        }
      });
      await setState('sample-map', map);
      await progress('running', `${typeName} done`);
    }
    await progress('done');
  } catch (error) {
    await setState('sample-map', map);
    await progress('failed', String(error.message || error).slice(0, 300));
    throw error;
  }
}
