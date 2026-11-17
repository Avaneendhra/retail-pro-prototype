// The Indian retail product list (public/catalog/products.json, built by
// scripts/build_catalog.py). It is downloaded once, kept by the browser for
// offline use, and searched on the device: by barcode first, by name when a
// product has no barcode in the list.
import { normalizeSize } from './productLookup.js';

const SOURCE = 'Product list';

/** Scanned codes in the form the list stores them: EAN-8 or EAN-13. */
export function normalizeCode(code) {
  let s = String(code || '').replace(/\D/g, '');
  if (s.length === 14 && s.startsWith('0')) s = s.slice(1);
  if (s.length === 12) s = `0${s}`;
  return s;
}

const SIZE_IN_NAME = /(\d+(?:[.,]\d+)?)\s*(kg|g|gm|gms|grams?|ml|l|ltr|litres?|liters?|pcs|pc)\b/gi;
const STOP = new Set(['and', 'the', 'with', 'for', 'pack', 'of', 'new', 'free', 'buy', 'get', 'combo', 'pouch', 'bottle', 'jar', 'box']);

/** The words that identify a product, without sizes or filler. */
function words(text) {
  return String(text || '').toLowerCase()
    .replace(/['’`]/g, '')
    .replace(SIZE_IN_NAME, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
}

/** Several packets sold together: their price is not the price of one. */
const MULTIPACK = /\bpack\s*of\s*\d+|\b\d+\s*[x×]\s*\d|multi\s*-?\s*pack|\bcombo\b/i;

const sameWord = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
const sizeKey = (s) => normalizeSize(s).toLowerCase().replace(/\s/g, '');

function sizeOf(row) {
  if (row[3]) return sizeKey(row[3]);
  const all = [...row[1].matchAll(SIZE_IN_NAME)];
  return all.length ? sizeKey(all[all.length - 1][0]) : '';
}

/** data: the parsed products.json. */
export function createProductList(data) {
  const rows = data?.rows || [];
  const subs = data?.subs || [];
  const byCode = new Map();
  rows.forEach((row, i) => { const c = normalizeCode(row[0]); if (c && !byCode.has(c)) byCode.set(c, i); });

  const toProduct = (row) => ({
    barcode: normalizeCode(row[0]), name: row[1], brand: row[2], size: row[3], price: Number(row[4]) || 0,
    category: row[5] || 'other', subCategory: subs[row[6]] || '', image: row[7] ? `${data.imageBase || ''}${row[7]}` : '', source: SOURCE,
  });

  let index = null; // word -> row numbers, built on the first name search
  let rowWords = null;
  const buildIndex = () => {
    index = new Map();
    rowWords = rows.map((row, i) => {
      const w = [...new Set(words(`${row[2]} ${row[1]}`))];
      for (const word of w) { if (!index.has(word)) index.set(word, []); index.get(word).push(i); }
      return w;
    });
  };

  return {
    size: rows.length,

    findByBarcode(code) {
      const i = byCode.get(normalizeCode(code));
      return i === undefined ? null : toProduct(rows[i]);
    },

    /**
     * The product whose name contains (almost) every word read from the label.
     * When a pack size was read, the product must be that size.
     */
    findByName(name, size = '') {
      const want = [...new Set(words(name))];
      if (want.length < 2) return null;
      if (!index) buildIndex();
      const wantSize = size ? sizeKey(size) : '';
      const wantMulti = MULTIPACK.test(name);
      const candidates = new Set();
      for (const w of want) for (const i of index.get(w) || []) candidates.add(i);
      let best = null;
      for (const i of candidates) {
        const have = rowWords[i];
        const found = want.filter((w) => have.some((h) => sameWord(w, h))).length;
        const cover = found / want.length;
        if (cover < 0.75 || found < 2) continue;
        if (MULTIPACK.test(rows[i][1]) !== wantMulti) continue;
        if (wantSize && sizeOf(rows[i]) !== wantSize) continue;
        const extra = have.length - found;
        if (!best || cover > best.cover || (cover === best.cover && extra < best.extra)) best = { i, cover, extra };
      }
      return best ? toProduct(rows[best.i]) : null;
    },
  };
}

let loading = null;

/** Downloads the list once per page load; resolves to null when it cannot be had. */
export function loadProductList() {
  if (!loading) {
    const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
    loading = fetch(`${base}catalog/products.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (data ? createProductList(data) : null))
      .catch(() => null)
      .then((list) => { if (!list) loading = null; return list; }); // try again next time
  }
  return loading;
}
