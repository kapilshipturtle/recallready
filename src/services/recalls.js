// Recall cases in Jira: create, read (with confirmations merged in), confirm, milestones,
// close, list, and catalog lookups for the board, the panel, Rovo and MCP.
import { fromText, noticeRef } from '../lib/notices.js';
import { matchNotice } from '../lib/match.js';
import { normalizeGtin, normalizeModel } from '../lib/ids.js';
import { buildCase, markMilestone, caseSummary, closingRecord, caseTitle, stopSaleTitle, caseOpenedLine, storedCase, fitsInProperty, caseForRead, openCheck } from '../lib/case.js';
import { overlappingCases } from '../lib/answers.js';
import { clockStatus } from '../lib/clocks.js';
import { docFromBlocks, textToAdf } from '../lib/adf.js';
import { loadCatalog, loadObjects } from '../platform/assets.js';
import * as jira from '../platform/jira.js';
import { getSettings, claimOnce, deleteState } from '../platform/settings.js';

export const CASE_LABEL = 'recallready-case';
export const DRILL_LABEL = 'recallready-drill';
export const STOP_LABEL = 'recallready-stop-sale';
const BULK = 50; // Jira creates at most 50 work items per bulk call
const LOT_CLAIM_MINUTES = 5; // longer than Jira search takes to show a new case

export async function requireSettings() {
  const settings = await getSettings();
  if (!settings.schemaIds) throw new Error('Set up RecallReady first: Jira settings, Apps, RecallReady.');
  if (!settings.projectKey) throw new Error('Choose the project for recall cases in RecallReady settings.');
  return settings;
}

const timeText = (iso) => `${String(iso).slice(0, 16).replace('T', ' ')} UTC`;
const ordersCount = (c) => (Number.isFinite(c.ordersTotal) ? c.ordersTotal : (c.orders || []).length);

function caseDescription(c, evidence) {
  const orders = ordersCount(c);
  return docFromBlocks([
    { text: caseOpenedLine(c) },
    c.notice.url ? { text: 'Source: ', link: { text: c.notice.title || c.notice.url, href: c.notice.url } } : { text: `Notice: ${c.notice.title}` },
    c.notice.reason ? { text: `Reason: ${c.notice.reason}` } : {},
    { heading: 'What is affected' },
    { bullets: c.products.map((p) => `${p.name}${p.gtin ? `, GTIN ${p.gtin}` : ''}`) },
    { bullets: c.lots.map((l) => `Lot ${l.code}${l.bestBy ? `, best by ${l.bestBy}` : ''}`) },
    { heading: 'Where it is' },
    c.locations.length
      ? { bullets: c.locations.map((l) => `${l.name} (${l.type}): ${l.expectedUnits} units`) }
      : { text: 'No location holds stock of the affected lots, so there is nothing to pull from sale.' },
    { text: orders ? `${orders} online order${orders === 1 ? '' : 's'} contain affected lots.` : 'No online orders contain affected lots.' },
    { heading: 'Response plan' },
    { bullets: clockStatus(c.startedAt, c.plan, c.milestones, c.startedAt).map((k) => `${k.label}: ${k.metAt ? 'not needed' : `due ${timeText(k.dueAt)}`}`) },
    ...(evidence && evidence.length ? [{ heading: 'Why it matched' }, { bullets: evidence }] : []),
  ]);
}

function stopSaleDescription(c, location) {
  const lots = location.lotUnits.length === 1 ? 'lot' : 'lots';
  const first = c.drill
    ? `Mock recall (a recall test). Do not take anything off sale. Find every unit of the ${lots} below at ${location.name} and count them.`
    : `Pull every unit of the recalled ${lots} from sale at ${location.name} and keep them aside for return or disposal.`;
  return docFromBlocks([
    { text: first },
    { bullets: location.lotUnits.map((l) => `Lot ${l.code}: ${l.units} units expected`) },
    { text: `When done, open the RecallReady panel on this task and confirm how many units you ${c.drill ? 'found' : 'pulled'}.` },
  ]);
}

// Every open recall case in the site, read with the app's access so the answer is complete even
// for people who cannot browse the recall project. Throws if any page cannot be read.
export async function openCaseIndex() {
  const cases = await jira.search('app', `labels = ${CASE_LABEL} AND statusCategory != Done ORDER BY created DESC`, { fields: ['summary'], max: 2000 });
  return cases
    .filter((c) => c.property?.role === 'case')
    .map((c) => ({
      issueKey: c.key,
      title: c.fields?.summary || '',
      drill: Boolean(c.property.drill),
      lots: (c.property.lots || []).map((l) => l.code),
      lotKeys: (c.property.lots || []).map((l) => l.key),
      productKeys: (c.property.products || []).map((p) => p.key),
    }));
}

// The online orders that contain any of these lots, read from Assets when they are needed.
export async function ordersForLots(schemaIds, lotKeys) {
  const wanted = new Set(lotKeys || []);
  const orders = await loadObjects(schemaIds, 'Order');
  return orders.filter((o) => wanted.has(o.lotKey)).map((o) => ({ orderNumber: o.orderNumber, units: Number(o.units), customerName: o.customerName, customerEmail: o.customerEmail, lotKey: o.lotKey }));
}

// selections: [{ productKey, lotKeys? }]. Empty lotKeys means every lot of that product.
export async function startRecall({ notice, selections, drill = false, evidence = [], who = 'user' }) {
  const settings = await requireSettings();
  const catalog = await loadCatalog(settings.schemaIds);
  const matches = (selections || []).map((s) => {
    const all = catalog.lots.filter((l) => l.productKey === s.productKey).map((l) => l.key);
    const chosen = (s.lotKeys || []).filter((k) => all.includes(k));
    return { productKey: s.productKey, lotKeys: chosen.length ? chosen : all };
  }).filter((m) => catalog.products.some((p) => p.key === m.productKey));
  if (!matches.length) throw new Error('Choose at least one product from the catalog.');

  const caseData = buildCase({ notice, matches, catalog, plan: settings.plan, now: new Date().toISOString(), drill });
  const check = openCheck(caseData);
  if (!check.ok) throw new Error(check.message);

  // One open case per lot: a second notice for the same lot, a retry or a double click must not
  // send every store a second set of tasks.
  const overlap = overlappingCases(await openCaseIndex(), caseData.lots.map((l) => l.key), drill);
  if (overlap.length) {
    throw new Error(`Already under an open ${overlap[0].drill ? 'mock recall' : 'recall'}: ${overlap.map((c) => `${c.issueKey} (lots ${c.lots.join(', ')})`).join('; ')}.`);
  }

  const stored = { ...storedCase(caseData), role: 'case' };
  if (!fitsInProperty(stored)) {
    throw new Error(`This recall covers ${caseData.locations.length} locations, more than one case can hold. Start it for fewer products or lots at a time.`);
  }

  // Jira search shows a new case only after a short delay, so each lot is also claimed for a few
  // minutes. Two starts for the same lot at the same moment cannot both pass.
  const lotClaims = [];
  for (const lot of caseData.lots) {
    const key = `rr-lot:${lot.key}`;
    if (await claimOnce(key, { at: caseData.startedAt }, LOT_CLAIM_MINUTES)) {
      lotClaims.push(key);
    } else {
      await Promise.all(lotClaims.map((k) => deleteState(k).catch(() => null)));
      throw new Error(`A recall for lot ${lot.code} is being opened right now. Refresh the board in a minute.`);
    }
  }
  try {
    return await createCase({ settings, caseData, stored, drill, evidence, who });
  } catch (error) {
    await Promise.all(lotClaims.map((k) => deleteState(k).catch(() => null)));
    throw error;
  }
}

async function createCase({ settings, caseData, stored, drill, evidence, who }) {

  const project = await jira.getProject(settings.projectKey, who);
  const types = project.issueTypes || [];
  const caseType = types.find((t) => !t.subtask && t.name === 'Task') || types.find((t) => !t.subtask);
  const subType = types.find((t) => t.subtask);
  if (!caseType || !subType) throw new Error(`Project ${settings.projectKey} needs a standard work type and a sub-task type.`);

  const parent = await jira.createIssue(who, {
    project: { key: settings.projectKey },
    issuetype: { id: caseType.id },
    summary: caseTitle(caseData),
    description: caseDescription(caseData, evidence),
    labels: drill ? [CASE_LABEL, DRILL_LABEL] : [CASE_LABEL],
  });
  // The case is readable from the first moment, even if creating its tasks fails later.
  await jira.setProperty(who, parent.key, stored);

  if (caseData.locations.length) {
    const subKeys = {};
    try {
      for (let i = 0; i < caseData.locations.length; i += BULK) {
        const chunk = caseData.locations.slice(i, i + BULK);
        const created = await jira.createIssues(who, chunk.map((location) => ({
          fields: {
            project: { key: settings.projectKey },
            issuetype: { id: subType.id },
            parent: { key: parent.key },
            summary: stopSaleTitle(location, drill),
            description: stopSaleDescription(caseData, location),
            labels: drill ? [STOP_LABEL, DRILL_LABEL] : [STOP_LABEL],
          },
          properties: [{ key: 'recallready', value: { version: 1, role: 'location', caseKey: parent.key, locationKey: location.key, confirmation: null } }],
        })));
        chunk.forEach((location, index) => { subKeys[location.key] = created[index]?.key || null; });
      }
    } catch (error) {
      const message = String(error?.message || error).slice(0, 300);
      await jira.addComment(who, parent.key, textToAdf(`RecallReady could not create every stop-sale task: ${message}`)).catch(() => null);
      throw new Error(`Case ${parent.key} was opened, but not every stop-sale task could be created: ${message}`);
    }
    await jira.setProperty(who, parent.key, { ...stored, locations: stored.locations.map((l) => ({ ...l, subtaskKey: subKeys[l.key] || null })) });
  }
  return { issueKey: parent.key, locations: caseData.locations.length };
}

export async function getCase(issueKey, who = 'user') {
  const property = await jira.getProperty(who, issueKey);
  if (!property) return null;
  if (property.role === 'location') return { role: 'location', issueKey, ...property };
  const subtasks = await jira.search(who, `parent = ${issueKey} AND labels = ${STOP_LABEL}`, { fields: ['summary', 'status'], max: 1000 });
  const confirmations = subtasks.map((s) => s.property?.confirmation).filter(Boolean);
  return {
    role: 'case',
    issueKey,
    caseData: caseForRead(property, confirmations),
    subtasks: subtasks.map((s) => ({ key: s.key, status: s.fields?.status?.name || '', done: s.fields?.status?.statusCategory?.key === 'done' })),
  };
}

export async function confirm({ issueKey, units, note, who = 'user' }) {
  const property = await jira.getProperty(who, issueKey);
  if (!property || property.role !== 'location') throw new Error('This work item is not a RecallReady stop-sale task.');
  const parent = await jira.getProperty(who, property.caseKey);
  if (parent?.milestones?.closed) throw new Error('This recall is closed, so its confirmations can no longer change.');
  const count = Number(units);
  if (!Number.isFinite(count) || count < 0) throw new Error('Units must be 0 or more');
  const by = await jira.myName(who === 'app' ? 'app' : 'user').catch(() => 'Someone');
  const at = new Date().toISOString();
  await jira.setProperty(who, issueKey, { ...property, confirmation: { locationKey: property.locationKey, units: count, note: String(note || '').slice(0, 500), by, at } });
  const said = parent?.drill ? `Mock recall count confirmed by ${by}: ${count} units found.` : `Stop sale confirmed by ${by}: ${count} units pulled.`;
  await jira.addComment(who, issueKey, textToAdf(`${said}${note ? ` Note: ${String(note).slice(0, 500)}` : ''}`));
  await jira.transitionToDone(who, issueKey).catch(() => false);
  return getCase(property.caseKey, who);
}

export async function setMilestone({ issueKey, key, who = 'user' }) {
  const property = await jira.getProperty(who, issueKey);
  if (!property || property.role !== 'case') throw new Error('This work item is not a RecallReady case.');
  if (property.milestones?.closed) throw new Error('This recall is closed.');
  const by = await jira.myName(who).catch(() => 'Someone');
  await jira.setProperty(who, issueKey, markMilestone(property, key, new Date().toISOString(), by));
  return getCase(issueKey, who);
}

export async function closeRecall({ issueKey, who = 'user' }) {
  const current = await getCase(issueKey, who);
  if (!current || current.role !== 'case') throw new Error('This work item is not a RecallReady case.');
  if (current.caseData.milestones?.closed) throw new Error('This recall is already closed.');
  const waiting = current.caseData.locations.filter((l) => l.confirmedUnits === null);
  if (waiting.length) throw new Error(`${waiting.length} location${waiting.length === 1 ? ' has' : 's have'} not confirmed yet: ${waiting.map((l) => l.name).join(', ')}.`);
  const by = await jira.myName(who).catch(() => 'Someone');
  const now = new Date().toISOString();
  let data = markMilestone(current.caseData, 'effectiveness', now, by);
  data = markMilestone(data, 'closed', now, by);
  const record = closingRecord(data, now);
  // The closed case is stored as a snapshot; the full timeline is in the closing record comment.
  let snapshot = { ...storedCase(data), role: 'case' };
  if (!fitsInProperty(snapshot)) snapshot = { ...snapshot, audit: snapshot.audit.slice(-40) };
  if (!fitsInProperty(snapshot)) snapshot = { ...snapshot, audit: [] };
  await jira.setProperty(who, issueKey, snapshot);
  await jira.addComment(who, issueKey, textToAdf(record));
  await jira.transitionToDone(who, issueKey).catch(() => false);
  return { record };
}

// Open recalls for the board: every project, newest first, with confirmations from one search.
export async function listOpenRecalls(who = 'user') {
  const cases = (await jira.search(who, `labels = ${CASE_LABEL} AND statusCategory != Done ORDER BY created DESC`, { fields: ['summary'], max: 200 }))
    .filter((c) => c.property?.role === 'case');
  if (!cases.length) return [];
  const tasks = await jira.search(who, `parent in (${cases.map((c) => c.key).join(',')}) AND labels = ${STOP_LABEL}`, { fields: ['status'], max: 5000 });
  const byCase = {};
  for (const t of tasks) {
    const conf = t.property?.confirmation;
    if (conf && t.property?.caseKey) (byCase[t.property.caseKey] ||= []).push(conf);
  }
  const now = new Date().toISOString();
  return cases.map((c) => {
    const data = caseForRead(c.property, byCase[c.key] || []);
    return {
      issueKey: c.key,
      title: c.fields?.summary || '',
      drill: Boolean(data.drill),
      source: noticeRef(data.notice),
      startedAt: data.startedAt,
      productKeys: data.products.map((p) => p.key),
      lotKeys: data.lots.map((l) => l.key),
      lotCodes: data.lots.map((l) => l.code),
      summary: caseSummary(data, now),
    };
  });
}

// Is a product, GTIN, SKU or lot in the catalog, and is it under an open recall? `complete` is
// false when the open recalls could not all be read, so nobody is told it is safe to sell.
export async function checkProduct(query) {
  const settings = await requireSettings();
  const catalog = await loadCatalog(settings.schemaIds);
  const q = String(query || '').trim();
  const gtin = normalizeGtin(q);
  const model = normalizeModel(q);
  const lots = catalog.lots.filter((l) => l.code.toUpperCase() === q.toUpperCase());
  const products = catalog.products.filter((p) => (gtin && normalizeGtin(p.gtin) === gtin)
    || (model.length >= 3 && normalizeModel(p.sku) === model)
    || (q.length >= 3 && p.name.toLowerCase().includes(q.toLowerCase()))
    || lots.some((l) => l.productKey === p.key));
  const productKeys = new Set(products.map((p) => p.key));
  const lotKeys = new Set(lots.map((l) => l.key));
  let open = [];
  let complete = true;
  try {
    open = await openCaseIndex();
  } catch (error) {
    if (error?.name === 'NEEDS_AUTHENTICATION_ERR') throw error;
    complete = false;
  }
  const openCases = open.filter((r) => (lotKeys.size ? r.lotKeys.some((k) => lotKeys.has(k)) : r.productKeys.some((k) => productKeys.has(k))));
  return {
    products: products.map((p) => ({ key: p.key, name: p.name, gtin: p.gtin, sku: p.sku })),
    lots: lots.map((l) => ({ key: l.key, code: l.code, productKey: l.productKey })),
    openCases: openCases.map((r) => ({ issueKey: r.issueKey, title: r.title, lots: r.lots, drill: r.drill })),
    complete,
  };
}

export async function checkNotice(text) {
  const settings = await requireSettings();
  const catalog = await loadCatalog(settings.schemaIds);
  const notice = fromText(text);
  const productName = Object.fromEntries(catalog.products.map((p) => [p.key, p.name]));
  const lotCode = Object.fromEntries(catalog.lots.map((l) => [l.key, l.code]));
  const matches = matchNotice(notice, catalog).map((m) => ({ ...m, productName: productName[m.productKey], lotCodes: m.lotKeys.map((k) => lotCode[k]) }));
  return { notice, matches };
}
