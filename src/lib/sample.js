// A fictional retailer for demos, testing and mock recalls. Every brand is invented and every
// GTIN uses the GS1 restricted-circulation prefix 2, so nothing collides with a real product.
// The data is generated with a fixed seed, so it is the same on every install.
import { gtinCheckDigitOk } from './ids.js';

export const SAMPLE_COMPANY = 'Larkmere Market';
export const FICTIONAL_BRANDS = ['Larkmere', 'Quillbrook Farms', 'Pebblewick', 'Corvelle Baby', 'Nimbleo', 'Brightkettle'];

const PRODUCTS = [
  ['Food', 'Larkmere', 'Larkmere Creamy Peanut Butter 16 oz', 'LM-PB16C', 'Quillbrook Farms', 300],
  ['Food', 'Larkmere', 'Larkmere Crunchy Peanut Butter 16 oz', 'LM-PB16K', 'Quillbrook Farms', 300],
  ['Food', 'Quillbrook Farms', 'Quillbrook Farms Rustic Sourdough Bread Mix 14 oz', 'QF-BM14', 'Quillbrook Farms', 365],
  ['Food', 'Quillbrook Farms', 'Quillbrook Farms Honey Oat Granola 12 oz', 'QF-GR12', 'Quillbrook Farms', 270],
  ['Food', 'Larkmere', 'Larkmere Frozen Mixed Berries 32 oz', 'LM-MB32', 'Quillbrook Farms', 540],
  ['Food', 'Quillbrook Farms', 'Quillbrook Farms Organic Whole Milk 1 gal', 'QF-WM1G', 'Quillbrook Farms', 21],
  ['Food', 'Larkmere', 'Larkmere Baby Spinach 5 oz', 'LM-SP05', 'Quillbrook Farms', 12],
  ['Food', 'Quillbrook Farms', 'Quillbrook Farms Cheddar Snack Crackers 8 oz', 'QF-CC08', 'Quillbrook Farms', 240],
  ['Baby', 'Corvelle Baby', 'Corvelle Baby Organic Oat Cereal 8 oz', 'CB-OC08', 'Corvelle Baby', 365],
  ['Baby', 'Corvelle Baby', 'Corvelle Baby Apple Pear Puree Pouch 4 oz', 'CB-AP04', 'Corvelle Baby', 300],
  ['Baby', 'Corvelle Baby', 'Corvelle Baby Infant Formula Powder 12.4 oz', 'CB-IF12', 'Corvelle Baby', 540],
  ['Baby', 'Corvelle Baby', 'Corvelle Baby Silicone Teether Ring', 'CB-TR01', 'Corvelle Baby', 0],
  ['Household', 'Pebblewick', 'Pebblewick Lavender Laundry Pods 42 ct', 'PW-LP42', 'Pebblewick', 0],
  ['Household', 'Pebblewick', 'Pebblewick Multi-Surface Cleaner Spray 32 oz', 'PW-MS32', 'Pebblewick', 0],
  ['Household', 'Pebblewick', 'Pebblewick Unscented Dish Soap 24 oz', 'PW-DS24', 'Pebblewick', 0],
  ['Household', 'Pebblewick', 'Pebblewick Cedar Soy Candle 8 oz', 'PW-SC08', 'Pebblewick', 0],
  ['Toys', 'Nimbleo', 'Nimbleo Magnetic Building Tiles 60 Piece Set', 'NB-MT60', 'Nimbleo', 0],
  ['Toys', 'Nimbleo', 'Nimbleo Wooden Stacking Rainbow', 'NB-WR07', 'Nimbleo', 0],
  ['Toys', 'Nimbleo', 'Nimbleo Light-Up Bouncy Balls 3 Pack', 'NB-LB03', 'Nimbleo', 0],
  ['Toys', 'Nimbleo', 'Nimbleo Plush Sleepy Bear 12 in', 'NB-PB12', 'Nimbleo', 0],
  ['Small appliances', 'Brightkettle', 'Brightkettle Electric Kettle 1.7 L', 'BK-EK170', 'Brightkettle', 0],
  ['Small appliances', 'Brightkettle', 'Brightkettle Hot Air Popcorn Maker', 'BK-PM200', 'Brightkettle', 0],
  ['Small appliances', 'Brightkettle', 'Brightkettle Compact Air Fryer 4 qt', 'BK-AF400', 'Brightkettle', 0],
  ['Small appliances', 'Brightkettle', 'Brightkettle Tabletop Fire Bowl', 'BK-FB12', 'Brightkettle', 0],
];

const LOCATIONS = [
  ['S01', 'Larkmere Market Riverside', 'Store', 'North'],
  ['S02', 'Larkmere Market Old Town', 'Store', 'Central'],
  ['S03', 'Larkmere Market Bayside', 'Store', 'East'],
  ['S04', 'Larkmere Market Cedar Park', 'Store', 'West'],
  ['S05', 'Larkmere Market Maple Grove', 'Store', 'North'],
  ['S06', 'Larkmere Market Westgate', 'Store', 'West'],
  ['S07', 'Larkmere Market Southpoint', 'Store', 'South'],
  ['S08', 'Larkmere Market Lakeshore', 'Store', 'East'],
  ['W01', 'Larkmere Distribution Centre', 'Warehouse', 'Central'],
  ['O01', 'Larkmere Online Store', 'Online', 'Nationwide'],
];

const FIRST = ['Ana', 'Ben', 'Chloe', 'Dev', 'Elif', 'Femi', 'Grace', 'Hiro', 'Isla', 'Jonas', 'Kavya', 'Liam', 'Maya', 'Noah', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sami', 'Tara'];
const LAST = ['Alvarez', 'Brooks', 'Chen', 'Dubois', 'Evans', 'Fischer', 'Gupta', 'Hughes', 'Ibrahim', 'Jensen', 'Kim', 'Lopez', 'Moreau', 'Novak', 'Okafor', 'Patel', 'Rossi', 'Silva', 'Tanaka', 'Weber'];

// Small seeded PRNG (mulberry32) so the sample is identical everywhere.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gtinFor(index) {
  const body = `0200000${String(index).padStart(6, '0')}`; // 13 digits: 0 + GTIN-13 body starting with 2
  for (let d = 0; d <= 9; d += 1) if (gtinCheckDigitOk(body + d)) return body + d;
  throw new Error('no check digit');
}

const addDays = (ymd, days) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86400e3).toISOString().slice(0, 10);
const MONTH_LETTER = 'ABCDEFGHIJKL';

function build() {
  const rand = seeded(20261114);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const products = PRODUCTS.map(([category, brand, name, sku, supplier], i) => ({
    key: `P${String(i + 1).padStart(2, '0')}`, name, brand, sku, gtin: gtinFor(i + 1), category, supplier,
  }));
  const locations = LOCATIONS.map(([key, name, type, region]) => ({ key, name, type, region }));

  const lots = [];
  products.forEach((p, i) => {
    const count = i === 0 ? 3 : 2 + Math.floor(rand() * 2);
    for (let n = 0; n < count; n += 1) {
      const madeMonth = 8 + ((i + n) % 3); // Sep..Nov 2026
      const madeDay = 1 + ((i * 5 + n * 9) % 27);
      const made = `2026-${String(madeMonth + 1).padStart(2, '0')}-${String(madeDay).padStart(2, '0')}`;
      const shelfDays = PRODUCTS[i][5];
      lots.push({
        key: `L${String(i + 1).padStart(2, '0')}-${n + 1}`,
        code: `26${MONTH_LETTER[madeMonth]}${String(madeDay).padStart(2, '0')}${String.fromCharCode(65 + (i % 26))}`,
        productKey: p.key,
        bestBy: shelfDays ? addDays(made, shelfDays) : '',
      });
    }
  });

  const stock = [];
  const addStock = (lotKey, locationKey, units) => stock.push({ key: `K${String(stock.length + 1).padStart(3, '0')}`, lotKey, locationKey, units });
  for (const lot of lots) {
    if (lot.productKey === 'P01' && lot.key === 'L01-1') {
      // Demo lot: widely distributed, so a mock recall touches many locations.
      [['W01', 48], ['S01', 36], ['S02', 24], ['S03', 18], ['S05', 30], ['S07', 12], ['O01', 20]].forEach(([loc, units]) => addStock(lot.key, loc, units));
      continue;
    }
    addStock(lot.key, 'W01', 12 + Math.floor(rand() * 60));
    for (const loc of locations.filter((l) => l.type === 'Store')) if (rand() < 0.45) addStock(lot.key, loc.key, 6 + Math.floor(rand() * 42));
    if (rand() < 0.5) addStock(lot.key, 'O01', 4 + Math.floor(rand() * 30));
  }

  const onlineLots = [...new Set(stock.filter((s) => s.locationKey === 'O01').map((s) => s.lotKey))];
  const orders = [];
  for (let i = 0; i < 40; i += 1) {
    const lotKey = i < 6 ? 'L01-1' : pick(onlineLots);
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7) % LAST.length];
    orders.push({
      key: `O${String(i + 1).padStart(3, '0')}`,
      orderNumber: `LM-${100001 + i}`,
      lotKey,
      units: 1 + Math.floor(rand() * 3),
      customerName: `${first} ${last}`,
      customerEmail: `${first}.${last}@example.com`.toLowerCase(),
      orderedAt: addDays('2026-10-01', Math.floor(rand() * 44)),
    });
  }
  return { products, lots, locations, stock, orders };
}

export const SAMPLE = build();
