// Recall cases in Jira: create, read (with confirmations merged in), confirm, milestones,
// close, list, and catalog lookups for the board, the panel, Rovo and MCP.
import { fromText, noticeRef } from '../lib/notices.js';
import { matchNotice } from '../lib/match.js';
import { normalizeGtin, normalizeModel } from '../lib/ids.js';
import { buildCase, applyConfirmations, markMilestone, caseSummary, closingRecord, caseTitle, stopSaleTitle, caseOpenedLine } from '../lib/case.js';
import { clockStatus } from '../lib/clocks.js';
import { docFromBlocks, textToAdf } from '../lib/adf.js';
import { loadCatalog } from '../platform/assets.js';
import * as jira from '../platform/jira.js';
import { getSettings } from '../platform/settings.js';

export const CASE_LABEL = 'recallready-case';
export const DRILL_LABEL = 'recallready-drill';
export const STOP_LABEL = 'recallready-stop-sale';
const MAX_PROPERTY_CHARS = 30000; // Jira entity properties are limited to 32 KB

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

function fitProperty(value) {
  let v = value;
  if (JSON.stringify(v).length > MAX_PROPERTY_CHARS) v = { ...v, orders: v.orders.slice(0, 150), ordersTotal: value.orders.length };
  if (JSON.stringify(v).length > MAX_PROPERTY_CHARS) v = { ...v, audit: v.audit.slice(-80) };
  return v;
}

export async function requireSettings() {
  const settings = await getSettings();
  if (!settings.schemaIds) throw new Error('Set up RecallReady first: Jira settings, Apps, RecallReady.');
  if (!settings.projectKey) throw new Error('Choose the project for recall cases in RecallReady settings.');
  return settings;
}

const timeText = (iso) => `${String(iso).slice(0, 16).replace('T', ' ')} UTC`;

function caseDescription(c, evidence) {
  return docFromBlocks([
    { text: caseOpenedLine(c) },
    c.notice.url ? { text: 'Source: ', link: { text: c.notice.title || c.notice.url, href: c.notice.url } } : { text: `Notice: ${c.notice.title}` },
    c.notice.reason ? { text: `Reason: ${c.notice.reason}` } : {},
    { heading: 'What is affected' },
    { bullets: c.products.map((p) => `${p.name}${p.gtin ? `, GTIN ${p.gtin}` : ''}`) },
    { bullets: c.lots.map((l) => `Lot ${l.code}${l.bestBy ? `, best by ${l.bestBy}` : ''}`) },
    { heading: 'Where it is' },
    { bullets: c.locations.map((l) => `${l.name} (${l.type}): ${l.expectedUnits} units`) },
    { text: c.orders.length ? `${c.orders.length} online order${c.orders.length === 1 ? '' : 's'} contain affected lots.` : 'No online orders contain affected lots.' },
    { heading: 'Response plan' },
    { bullets: clockStatus(c.startedAt, c.plan, c.milestones, c.startedAt).map((k) => `${k.label}: due ${timeText(k.dueAt)}`) },
    ...(evidence && evidence.length ? [{ heading: 'Why it matched' }, { bullets: evidence }] : []),
  ]);
}

function stopSaleDescription(c, location) {
  return docFromBlocks([
    { text: `Pull every unit of the recalled lot${location.lotUnits.length === 1 ? '' : 's'} from sale at ${location.name} and keep them aside for return or disposal.` },
    { bullets: location.lotUnits.map((l) => `Lot ${l.code}: ${l.units} units expected`) },
    { text: 'When done, open the RecallReady panel on this task and confirm how many units you pulled.' },
  ]);
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
  if (!caseData.locations.length) throw new Error('None of the chosen lots has stock at any location.');
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
  const subKeys = {};
  await pool(caseData.locations, 4, async (location) => {
    const sub = await jira.createIssue(who, {
      project: { key: settings.projectKey },
      issuetype: { id: subType.id },
      parent: { key: parent.key },
      summary: stopSaleTitle(location),
      description: stopSaleDescription(caseData, location),
      labels: [STOP_LABEL],
    });
    subKeys[location.key] = sub.key;
    await jira.setProperty(who, sub.key, { version: 1, role: 'location', caseKey: parent.key, locationKey: location.key, confirmation: null });
  });
  const stored = { ...caseData, role: 'case', locations: caseData.locations.map((l) => ({ ...l, subtaskKey: subKeys[l.key] || null })) };
  await jira.setProperty(who, parent.key, fitProperty(stored));
  return { issueKey: parent.key, locations: stored.locations.length };
}

export async function getCase(issueKey, who = 'user') {
  const property = await jira.getProperty(who, issueKey);
  if (!property) return null;
  if (property.role === 'location') return { role: 'location', issueKey, ...property };
  const subtasks = await jira.search(who, `parent = ${issueKey} AND labels = ${STOP_LABEL}`, { fields: ['summary', 'status'], max: 200 });
  const confirmations = subtasks.map((s) => s.property?.confirmation).filter(Boolean);
  return {
    role: 'case',
    issueKey,
    caseData: applyConfirmations(property, confirmations),
    subtasks: subtasks.map((s) => ({ key: s.key, status: s.fields?.status?.name || '', done: s.fields?.status?.statusCategory?.key === 'done' })),
  };
}

export async function confirm({ issueKey, units, note, who = 'user' }) {
  const property = await jira.getProperty(who, issueKey);
  if (!property || property.role !== 'location') throw new Error('This work item is not a RecallReady stop-sale task.');
  const count = Number(units);
  if (!Number.isFinite(count) || count < 0) throw new Error('Units must be 0 or more');
  const by = await jira.myName(who === 'app' ? 'app' : 'user').catch(() => 'Someone');
  const at = new Date().toISOString();
  await jira.setProperty(who, issueKey, { ...property, confirmation: { locationKey: property.locationKey, units: count, note: String(note || ''), by, at } });
  await jira.addComment(who, issueKey, textToAdf(`Stop sale confirmed by ${by}: ${count} units pulled.${note ? ` Note: ${note}` : ''}`));
  await jira.transitionToDone(who, issueKey).catch(() => false);
  return getCase(property.caseKey, who);
}

export async function setMilestone({ issueKey, key, who = 'user' }) {
  const property = await jira.getProperty(who, issueKey);
  if (!property || property.role !== 'case') throw new Error('This work item is not a RecallReady case.');
  const by = await jira.myName(who).catch(() => 'Someone');
  await jira.setProperty(who, issueKey, fitProperty(markMilestone(property, key, new Date().toISOString(), by)));
  return getCase(issueKey, who);
}

export async function closeRecall({ issueKey, who = 'user' }) {
  const current = await getCase(issueKey, who);
  if (!current || current.role !== 'case') throw new Error('This work item is not a RecallReady case.');
  const waiting = current.caseData.locations.filter((l) => l.confirmedUnits === null);
  if (waiting.length) throw new Error(`${waiting.length} location${waiting.length === 1 ? ' has' : 's have'} not confirmed yet: ${waiting.map((l) => l.name).join(', ')}.`);
  const by = await jira.myName(who).catch(() => 'Someone');
  const now = new Date().toISOString();
  let data = markMilestone(current.caseData, 'effectiveness', now, by);
  data = markMilestone(data, 'closed', now, by);
  const record = closingRecord(data, now);
  await jira.setProperty(who, issueKey, fitProperty({ ...data, role: 'case' }));
  await jira.addComment(who, issueKey, textToAdf(record));
  await jira.transitionToDone(who, issueKey).catch(() => false);
  return { record };
}

export async function listOpenRecalls(who = 'user') {
  const settings = await getSettings();
  if (!settings.projectKey) return [];
  const cases = await jira.search(who, `project = ${settings.projectKey} AND labels = ${CASE_LABEL} AND statusCategory != Done ORDER BY created DESC`, { max: 50 });
  const now = new Date().toISOString();
  const rows = await Promise.all(cases.map(async (c) => {
    const full = await getCase(c.key, who).catch(() => null);
    if (!full || full.role !== 'case') return null;
    const data = full.caseData;
    return {
      issueKey: c.key,
      title: c.fields.summary,
      drill: Boolean(data.drill),
      source: noticeRef(data.notice),
      startedAt: data.startedAt,
      productKeys: data.products.map((p) => p.key),
      lotKeys: data.lots.map((l) => l.key),
      lotCodes: data.lots.map((l) => l.code),
      summary: caseSummary(data, now),
    };
  }));
  return rows.filter(Boolean);
}

// Is a product, GTIN, SKU or lot in the catalog, and is it under an open recall?
export async function checkProduct(query, who = 'user') {
  const settings = await requireSettings();
  const catalog = await loadCatalog(settings.schemaIds);
  const q = String(query || '').trim();
  const gtin = normalizeGtin(q);
  const model = normalizeModel(q);
  const lots = catalog.lots.filter((l) => l.code.toUpperCase() === q.toUpperCase());
  const products = catalog.products.filter((p) => (gtin && p.gtin === gtin)
    || (model.length >= 3 && normalizeModel(p.sku) === model)
    || (q.length >= 3 && p.name.toLowerCase().includes(q.toLowerCase()))
    || lots.some((l) => l.productKey === p.key));
  const productKeys = new Set(products.map((p) => p.key));
  const lotKeys = new Set(lots.map((l) => l.key));
  const open = await listOpenRecalls(who);
  const openCases = open.filter((r) => (lotKeys.size ? r.lotKeys.some((k) => lotKeys.has(k)) : r.productKeys.some((k) => productKeys.has(k))));
  return {
    products: products.map((p) => ({ key: p.key, name: p.name, gtin: p.gtin, sku: p.sku })),
    lots: lots.map((l) => ({ key: l.key, code: l.code, productKey: l.productKey })),
    openCases: openCases.map((r) => ({ issueKey: r.issueKey, title: r.title, lots: r.lotCodes, percent: r.summary.percent, drill: r.drill })),
  };
}

export async function checkNotice(text, who = 'user') {
  const settings = await requireSettings();
  const catalog = await loadCatalog(settings.schemaIds);
  const notice = fromText(text);
  const productName = Object.fromEntries(catalog.products.map((p) => [p.key, p.name]));
  const lotCode = Object.fromEntries(catalog.lots.map((l) => [l.key, l.code]));
  const matches = matchNotice(notice, catalog).map((m) => ({ ...m, productName: productName[m.productKey], lotCodes: m.lotKeys.map((k) => lotCode[k]) }));
  return { notice, matches };
}
