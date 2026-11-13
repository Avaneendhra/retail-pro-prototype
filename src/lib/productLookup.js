import Fuse from 'fuse.js';

// Product identification helpers for the unified scanner:
// barcode validation, open product database lookup, and label text parsing.

/** True when an EAN-13 / EAN-8 / UPC-A code has a valid check digit. */
export function isValidRetailCode(code) {
  const s = String(code || '').trim();
  if (!/^\d+$/.test(s)) return false;
  if (![8, 12, 13].includes(s.length)) return false;
  const digits = s.split('').map(Number);
  const check = digits.pop();
  // weights 3/1 from the right
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Barcodes that are not retail codes (Code 128 etc.) are accepted if long enough. */
export function isPlausibleBarcode(code, format = '') {
  const s = String(code || '').trim();
  if (/EAN|UPC/i.test(format) || /^\d{8}$|^\d{12,13}$/.test(s)) return isValidRetailCode(s);
  return s.length >= 6;
}

const CATEGORY_RULES = [
  ['dairy', /(dair|milk|butter|cheese|paneer|curd|yog|ghee|egg)/i],
  ['bakery', /(bread|bak|bun|cake|rusk|pav)/i],
  ['beverages', /(beverage|drink|juice|soda|cola|tea|coffee|water|chai)/i],
  ['snacks', /(snack|biscuit|cookie|chips|crisp|noodle|chocolate|confection|namkeen|candy|sweet)/i],
  ['personal', /(beauty|soap|shampoo|toothpaste|tooth|cosmetic|hygiene|skin|hair|deodor|lotion|face)/i],
  ['household', /(detergent|clean|wash|dish|household|floor|toilet|laundry)/i],
  ['grocery', /(rice|sugar|salt|oil|flour|atta|dal|pulse|lentil|spice|masala|cereal|grain|grocery|wheat|sauce|ketchup|pickle)/i],
];

export function guessCategory(...texts) {
  const t = texts.filter(Boolean).join(' ');
  for (const [cat, re] of CATEGORY_RULES) if (re.test(t)) return cat;
  return 'other';
}

const DBS = [
  { host: 'https://world.openfoodfacts.org', name: 'Open Food Facts' },
  { host: 'https://world.openbeautyfacts.org', name: 'Open Beauty Facts' },
  { host: 'https://world.openproductsfacts.org', name: 'Open Products Facts' },
];

const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Look a barcode up in the Open Food / Beauty / Products Facts databases. */
export async function lookupBarcode(code, { timeoutMs = 6000 } = {}) {
  const fields = 'product_name,product_name_en,generic_name,brands,quantity,categories_tags,categories,image_front_small_url,image_url';
  for (const db of DBS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${db.host}/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`, { signal: ctrl.signal });
      if (!res.ok) continue;
      const data = await res.json();
      const p = data?.product;
      if (data?.status !== 1 || !p) continue;
      const baseName = tidy(p.product_name_en || p.product_name || p.generic_name);
      if (!baseName) continue;
      const brand = tidy((p.brands || '').split(',')[0]);
      const size = tidy(p.quantity);
      const categoryText = [(p.categories_tags || []).join(' '), p.categories || ''].join(' ');
      return {
        source: db.name,
        name: composeName(brand, baseName, size),
        brand, size,
        category: db.name === 'Open Beauty Facts' ? 'personal' : guessCategory(categoryText, baseName),
        image: p.image_front_small_url || p.image_url || '',
      };
    } catch {
      /* network error / timeout: try the next database */
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** "Amul" + "Butter" + "100 g" -> "Amul Butter 100g" without repeating parts. */
export function composeName(brand, name, size) {
  let out = tidy(name);
  if (brand && !out.toLowerCase().includes(brand.toLowerCase())) out = `${brand} ${out}`;
  const s = normalizeSize(size);
  if (s && !out.toLowerCase().replace(/\s/g, '').includes(s.toLowerCase().replace(/\s/g, ''))) out = `${out} ${s}`;
  return titleCase(out);
}

export function normalizeSize(size) {
  const m = String(size || '').match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gm|gms|grams?|ml|l|ltr|litres?|liters?|pcs|pc|n)\b/i);
  if (!m) return tidy(size);
  const unit = m[2].toLowerCase()
    .replace(/^(gm|gms|grams?)$/, 'g').replace(/^(ltr|litres?|liters?)$/, 'L').replace(/^l$/, 'L').replace(/^(pc|n)$/, 'pcs');
  return `${m[1].replace(',', '.')}${unit}`;
}

const titleCase = (s) => s.replace(/\b([a-z])([a-z]*)/g, (m, a, b) => (m.length <= 2 && /^(ml|kg|g|l)$/i.test(m) ? m : a.toUpperCase() + b));

const NOISE = /^(mrp|m\.r\.p|price|rs|net|wt|weight|mfg|mfd|exp|best|batch|b\.no|ingr|contains|packed|marketed|manufactured|fssai|lic|customer|care|email|www|http|store|keep|use|veg|non|nutrition|energy|protein|carbo|fat|sugar\s*\d|sodium|inclusive|of all taxes|ean|barcode)/i;

/** Pull name / brand / size / MRP / barcode out of raw OCR text of a product label. */
export function parseLabelText(text) {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/).map(l => l.replace(/[^\p{L}\p{N}\s.&'%/+-]/gu, ' ').replace(/\s+/g, ' ').trim()).filter(l => l.length >= 2);

  // MRP: "MRP ₹ 45.00", "M.R.P. Rs.45", "₹ 120"
  let mrp = 0;
  const mrpMatch = raw.match(/M\.?\s*R\.?\s*P\.?[^\d]{0,15}(\d{1,5}(?:\.\d{1,2})?)/i)
    || raw.match(/(?:₹|Rs\.?|INR)\s*(\d{1,5}(?:\.\d{1,2})?)/i);
  if (mrpMatch) mrp = Math.round(parseFloat(mrpMatch[1]));

  const sizeMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gm|gms|grams?|ml|ltr|litres?|l)\b/i);
  const size = sizeMatch ? normalizeSize(sizeMatch[0]) : '';

  const codeMatch = (raw.replace(/\s(?=\d)/g, '').match(/\d{13}|\d{12}|\d{8}/g) || []).find(isValidRetailCode) || '';

  const candidates = lines
    .filter(l => /\p{L}{3,}/u.test(l) && !NOISE.test(l) && !/^\d/.test(l))
    .slice(0, 8);
  // Brand: a short, mostly upper-case line near the top
  const brandLine = candidates.find(l => l.split(' ').length <= 2 && l === l.toUpperCase() && /[A-Z]{3,}/.test(l)) || '';
  // Name: the longest of the first few meaningful lines
  const nameLine = candidates.filter(l => l !== brandLine).slice(0, 4).reduce((a, b) => (b.length > a.length ? b : a), '');
  const brand = brandLine ? titleCase(brandLine.toLowerCase()) : '';
  const base = (nameLine || brandLine).replace(new RegExp(`\\b${size.replace(/[.*+?^${}()|[\]\\]/g, '')}\\b`, 'i'), '').trim();
  const name = base ? composeName(brand, base.length > 3 && base === base.toUpperCase() ? base.toLowerCase() : base, size) : '';
  return { name, brand, size, mrp, barcode: codeMatch };
}

/** Grab the current frame of a <video> as a JPEG data URL. */
export function frameFromVideo(video, max = 1600) {
  if (!video || !video.videoWidth) return null;
  const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(video.videoWidth * scale);
  c.height = Math.round(video.videoHeight * scale);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.92);
}

export function dataUrlToFile(dataUrl, name = 'frame.jpg') {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.match(/data:(.*?);/)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}

/**
 * Strict catalogue match for the scanner: the whole name must be very close,
 * and when a pack size was read it must be the same size.
 */
export function strictMatch(products, name, size) {
  if (!name) return null;
  const fuse = new Fuse(products, { keys: ['name', 'names.te', 'names.hi', 'names.mr'], threshold: 0.2, includeScore: true, ignoreLocation: true });
  const [hit] = fuse.search(name, { limit: 1 });
  if (!hit || hit.score > 0.15) return null;
  const s = normalizeSize(size).toLowerCase();
  if (s && !hit.item.name.toLowerCase().replace(/\s/g, '').includes(s.replace(/\s/g, ''))) return null;
  return hit.item;
}

/**
 * Versions of an image that make 1D barcodes easier to decode:
 * centre crops (the barcode fills more of the frame) and a high-contrast copy.
 */
export function barcodeVariants(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const W = img.width, H = img.height;
      const make = (frac, binarize = false) => {
        const cw = Math.round(W * frac), ch = Math.round(H * frac);
        const c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        const x = c.getContext('2d');
        x.drawImage(img, (W - cw) / 2, (H - ch) / 2, cw, ch, 0, 0, cw, ch);
        if (binarize) {
          const d = x.getImageData(0, 0, cw, ch);
          const p = d.data;
          let sum = 0;
          for (let i = 0; i < p.length; i += 4) sum += 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
          const mean = sum / (p.length / 4);
          for (let i = 0; i < p.length; i += 4) {
            const v = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) < mean ? 0 : 255;
            p[i] = p[i + 1] = p[i + 2] = v;
          }
          x.putImageData(d, 0, 0);
        }
        return c.toDataURL('image/png');
      };
      resolve([make(0.7), make(1), make(0.5), make(0.7, true)]);
    };
    img.onerror = () => resolve([dataUrl]);
    img.src = dataUrl;
  });
}

/**
 * Label parsing that also uses text size from OCR: the product name and brand
 * are almost always the largest text on the pack.
 */
export function parseLabel({ text, lines = [] }) {
  const base = parseLabelText(text);
  const usable = lines
    .map(l => ({ ...l, clean: l.text.replace(/[^\p{L}\p{N}\s.&'%/+-]/gu, ' ').replace(/\s+/g, ' ').trim() }))
    .filter(l => l.clean.length >= 3 && /\p{L}{3,}/u.test(l.clean) && !NOISE.test(l.clean) && !/^\d/.test(l.clean));
  if (!usable.length) return base;
  const tallest = Math.max(...usable.map(l => l.height));
  // lines at least 60% as tall as the biggest text, top to bottom
  const big = usable.filter(l => l.height >= tallest * 0.5).sort((a, b) => a.y - b.y).slice(0, 3);
  if (!big.length) return base;
  const brandLine = big.length > 1 && big[0].clean.split(' ').length <= 2 ? big[0].clean : '';
  const nameParts = (brandLine ? big.slice(1) : big).map(l => l.clean);
  let nameText = nameParts.join(' ').replace(/\s+/g, ' ').trim();
  if (nameText === nameText.toUpperCase()) nameText = nameText.toLowerCase();
  const brand = brandLine ? titleCase(brandLine.toLowerCase()) : base.brand;
  if (!nameText) return { ...base, brand };
  const name = composeName(brand, nameText, base.size);
  return { ...base, brand, name: name || base.name };
}
