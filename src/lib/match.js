// Explainable matching of a recall Notice against the catalog. Pure functions.
// High: GTIN or model number match, or brand + product name + a listed lot.
// Medium: brand + product name (needs a person to review). Low: brand only.
import { normalizeGtin, normalizeModel } from './ids.js';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'with', 'for', 'in', 'on', 'by', 'to', 'or', 'all', 'from', 'its', 'per',
  'inc', 'llc', 'ltd', 'co', 'corp', 'company', 'brand', 'product', 'products',
  'oz', 'fl', 'lb', 'lbs', 'g', 'kg', 'mg', 'ml', 'l', 'gal', 'ct', 'pk', 'pack', 'count', 'x',
]);
const RANK = { High: 3, Medium: 2, Low: 1 };

// Lowercase words without stop words, units and bare numbers (sizes).
export function words(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

// Share of the product's words that appear in the other text (0..1). Asymmetric on purpose:
// recall notices are long, so a symmetric score would dilute a true match.
export function nameSimilarity(productName, otherText) {
  const own = [...new Set(words(productName))];
  if (!own.length) return 0;
  const other = new Set(words(otherText));
  return own.filter((w) => other.has(w)).length / own.length;
}

export function matchNotice(notice, catalog) {
  const text = [notice.title, notice.firm, notice.productText, notice.codeText].join(' ');
  const noticeWords = new Set(words(text));
  const noticeGtins = new Set(notice.gtins || []);
  const noticeModels = new Set((notice.models || []).map(normalizeModel).filter((m) => m.length >= 3));
  const noticeLots = new Set((notice.lots || []).map((l) => String(l).toUpperCase()));
  const results = [];

  for (const product of catalog.products || []) {
    const productLots = (catalog.lots || []).filter((l) => l.productKey === product.key);
    const lotHits = productLots.filter((l) => noticeLots.has(String(l.code || '').toUpperCase()));
    const evidence = [];
    const gtin = normalizeGtin(product.gtin);
    const sku = normalizeModel(product.sku);
    let confidence;
    let score;

    if (gtin && noticeGtins.has(gtin)) {
      confidence = 'High';
      score = 1;
      evidence.push(`GTIN ${gtin} appears in the notice`);
    } else if (sku.length >= 3 && noticeModels.has(sku)) {
      confidence = 'High';
      score = 0.95;
      evidence.push(`Model ${sku} matches SKU ${product.sku}`);
    } else {
      const brandWords = words(product.brand);
      const brandPresent = brandWords.length > 0 && brandWords.every((w) => noticeWords.has(w));
      if (!brandPresent) continue;
      const nameWithoutBrand = words(product.name).filter((w) => !brandWords.includes(w)).join(' ');
      const share = nameSimilarity(nameWithoutBrand, text);
      const total = new Set(words(nameWithoutBrand)).size;
      evidence.push(`Brand "${product.brand}" is named in the notice`);
      evidence.push(`${Math.round(share * total)} of ${total} product words found in the notice (${Math.round(share * 100)}%)`);
      if (share >= 0.6 && lotHits.length) {
        confidence = 'High';
        score = 0.9;
      } else if (share >= 0.6) {
        confidence = 'Medium';
        score = 0.5 + share * 0.3;
      } else {
        confidence = 'Low';
        score = share * 0.5;
      }
    }

    for (const lot of lotHits) evidence.push(`Lot ${lot.code} is listed in the notice`);
    results.push({
      productKey: product.key,
      confidence,
      score,
      lotKeys: (lotHits.length ? lotHits : productLots).map((l) => l.key),
      evidence,
    });
  }

  return results.sort((a, b) => RANK[b.confidence] - RANK[a.confidence] || b.score - a.score);
}
