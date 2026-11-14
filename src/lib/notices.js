// Turns FDA enforcement reports, CPSC recalls and pasted text into one Notice shape that the
// matcher understands. Pure functions.
import { createHash } from 'crypto';
import { extractGtins, extractLots, normalizeGtin, normalizeModel } from './ids.js';

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const ymd = (value) => {
  const s = String(value || '');
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
};
const unique = (list) => [...new Set(list.filter(Boolean))];

function finish(notice) {
  const allText = [notice.title, notice.productText, notice.codeText].join(' ');
  return {
    ...notice,
    gtins: unique([...(notice.gtins || []), ...extractGtins(allText)]),
    lots: unique([...(notice.lots || []), ...extractLots(allText)]),
    models: unique((notice.models || []).map(normalizeModel)),
  };
}

// openFDA enforcement report (food, drug or device).
export function fromFda(record, kind) {
  const number = clean(record.recall_number);
  return finish({
    source: `FDA ${kind}`,
    id: `FDA:${number}`,
    title: clean(record.product_description).slice(0, 160),
    firm: clean(record.recalling_firm),
    date: ymd(record.report_date),
    classification: clean(record.classification),
    reason: clean(record.reason_for_recall),
    productText: clean(record.product_description),
    codeText: clean([record.code_info, record.more_code_info].filter(Boolean).join(' ')),
    url: `https://api.fda.gov/${kind}/enforcement.json?search=recall_number:"${number}"`,
    gtins: [],
    lots: [],
    models: [],
  });
}

// CPSC Recalls API record.
export function fromCpsc(record) {
  const products = record.Products || [];
  const firmSource = [record.Manufacturers, record.Importers, record.Distributors].find((list) => list && list.length);
  return finish({
    source: 'CPSC',
    id: `CPSC:${clean(record.RecallNumber)}`,
    title: clean(record.Title),
    firm: clean(firmSource ? firmSource[0].Name : ''),
    date: ymd(record.RecallDate),
    classification: '',
    reason: clean((record.Hazards || []).map((h) => h.Name).join(' ')),
    productText: clean(products.map((p) => [p.Name, p.Description, p.Type].filter(Boolean).join(' ')).join(' | ')),
    codeText: clean(record.Description),
    url: clean(record.URL),
    gtins: (record.ProductUPCs || []).map((u) => normalizeGtin(u.UPC)).filter(Boolean),
    lots: [],
    models: products.map((p) => p.Model).filter(Boolean),
  });
}

// A supplier notice, email or any pasted text. The id is stable for the same text.
export function fromText(text, title) {
  const body = clean(text);
  return finish({
    source: 'Text',
    id: `TEXT:${createHash('sha256').update(body).digest('hex').slice(0, 12)}`,
    title: clean(title) || body.slice(0, 120),
    firm: '',
    date: '',
    classification: '',
    reason: '',
    productText: body,
    codeText: '',
    url: '',
    gtins: [],
    lots: [],
    models: [],
  });
}

// Where a notice came from, in the words people use. Internal ids (FDA:, CPSC:, TEXT:, DRILL:)
// never reach a person.
export function noticeRef(notice) {
  const id = String(notice?.id || '');
  const number = id.slice(id.indexOf(':') + 1);
  if (id.startsWith('FDA:') || id.startsWith('CPSC:')) return `${notice.source} recall ${number}`;
  if (id.startsWith('TEXT:')) return 'pasted notice text';
  if (id.startsWith('DRILL:')) return 'mock recall';
  return [notice?.source, id].filter(Boolean).join(' ');
}

const SOURCE_LABELS = { Text: 'Pasted notice' };

// One line naming a notice. A title that already names its source is shown alone.
export function noticeHeadline(notice) {
  const label = SOURCE_LABELS[notice?.source] || notice?.source || '';
  const title = String(notice?.title || '');
  if (!label || title.toLowerCase().startsWith(label.toLowerCase())) return title;
  return `${label}: ${title}`;
}
