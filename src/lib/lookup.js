// Finds catalog products and lots named in a free-text question, such as
// "Can we still sell Nimbleo Plush Sleepy Bear lot 26J15T?". Pure function.
import { normalizeGtin, normalizeModel, extractGtins } from './ids.js';
import { nameSimilarity } from './match.js';

export function findInCatalog(query, catalog) {
  const q = String(query || '').trim();
  const tokens = q.split(/[^A-Za-z0-9-]+/).filter(Boolean);
  const upper = new Set(tokens.map((t) => t.toUpperCase()));
  const gtins = new Set([normalizeGtin(q), ...extractGtins(q)].filter(Boolean));
  const models = new Set(tokens.map(normalizeModel).filter((m) => m.length >= 3));
  const lower = q.toLowerCase();
  const lots = (catalog.lots || []).filter((l) => upper.has(String(l.code || '').toUpperCase()));
  const products = (catalog.products || []).filter((p) => {
    const gtin = normalizeGtin(p.gtin);
    const sku = normalizeModel(p.sku);
    return (gtin && gtins.has(gtin))
      || (sku.length >= 3 && models.has(sku))
      || (lower.length >= 3 && p.name.toLowerCase().includes(lower))
      || nameSimilarity(p.name, q) >= 0.6
      || lots.some((l) => l.productKey === p.key);
  });
  return { products, lots };
}
