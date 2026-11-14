// Identifier parsing for recall notices: GTIN/UPC/EAN product codes, lot codes and model numbers.
// Pure functions, no Forge imports, so they are unit-tested with node --test.

// GS1 mod-10 check for a 14-digit GTIN: weights 3,1,3,1... from the left over the first 13 digits.
export function gtinCheckDigitOk(d14) {
  if (!/^\d{14}$/.test(String(d14 || ''))) return false;
  let sum = 0;
  for (let i = 0; i < 13; i += 1) sum += Number(d14[i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(d14[13]);
}

// Any GTIN-8/12/13/14 (digits, spaces or dashes allowed) as a 14-digit string, or null if invalid.
export function normalizeGtin(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(digits.length)) return null;
  const padded = digits.padStart(14, '0');
  return gtinCheckDigitOk(padded) ? padded : null;
}

// Finds GTINs written in free text, e.g. "UPC 2 001234 56789 3". Only 12-14 digit codes are
// considered (shorter runs are too often dates, phone numbers or quantities).
export function extractGtins(text) {
  const found = [];
  const runs = String(text || '').match(/\d+(?:[ -]\d+)*/g) || [];
  for (const run of runs) {
    const groups = run.split(/[ -]/);
    for (let start = 0; start < groups.length; start += 1) {
      let joined = '';
      for (let end = start; end < groups.length; end += 1) {
        joined += groups[end];
        if (joined.length > 14) break;
        if (joined.length >= 12) {
          const gtin = normalizeGtin(joined);
          if (gtin) {
            if (!found.includes(gtin)) found.push(gtin);
            start = end;
            break;
          }
        }
      }
    }
  }
  return found;
}

const LOT_KEYWORD = /\b(?:lots?|batch(?:es)?)\b(?:\s*(?:#|nos?\.?|numbers?|codes?))?\s*[:#]?\s*/gi;
const DATE_LIKE = /^(?:\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})$/;

function isLotCode(token) {
  return token.length >= 3 && /\d/.test(token) && !DATE_LIKE.test(token);
}

// Lot or batch codes that follow "Lot", "Lot #:", "Lots", "Batch No." etc. Lists separated by
// commas, semicolons, "and" or "&" are read until the next word that is not a code.
export function extractLots(text) {
  const source = String(text || '');
  const lots = [];
  for (const match of source.matchAll(LOT_KEYWORD)) {
    let rest = source.slice(match.index + match[0].length);
    for (;;) {
      const token = rest.match(/^[A-Za-z0-9][A-Za-z0-9/.-]*/);
      if (!token) break;
      const code = token[0].replace(/[.]+$/, '');
      if (!isLotCode(code)) break;
      const upper = code.toUpperCase();
      if (!lots.includes(upper)) lots.push(upper);
      rest = rest.slice(token[0].length);
      const sep = rest.match(/^\s*(?:,|;|&|\band\b)\s*/i);
      if (!sep) break;
      rest = rest.slice(sep[0].length);
    }
  }
  return lots;
}

// Model or SKU numbers compared without spaces, dashes or case.
export function normalizeModel(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
