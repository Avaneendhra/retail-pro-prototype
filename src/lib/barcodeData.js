// What a scanned code actually contains.
//
// An ordinary product barcode (EAN-13 / UPC, the stripes on almost every packet)
// holds one thing: the product number. GS1 codes (DataMatrix, DataBar, GS1-128,
// GS1 QR links) can also carry the batch, manufacturing and expiry dates, and
// sometimes the price. This file reads all of that.

const GS = '\x1d';

/* GS1 Application Identifiers we use, and the fixed length of their data (null = variable). */
const FIXED = { '00': 18, '01': 14, '02': 14, 11: 6, 12: 6, 13: 6, 15: 6, 16: 6, 17: 6, 20: 2 };
const TWO_DIGIT_VARIABLE = new Set(['10', '21', '22', '30', '37', '90', '91', '92', '93', '94', '95', '96', '97', '98', '99']);

/** How many digits the AI at the start of `s` has, and its data length (null = up to the next separator). */
function aiAt(s) {
  const two = s.slice(0, 2);
  if (FIXED[two] !== undefined) return [2, FIXED[two]];
  if (TWO_DIGIT_VARIABLE.has(two)) return [2, null];
  const four = s.slice(0, 4);
  if (/^3[1-6]\d\d$/.test(four)) return [4, 6]; // weights and measures
  if (/^39[0-4]\d$/.test(four)) return [4, null]; // amounts and prices
  if (/^7\d\d\d$/.test(four)) return [4, null];
  if (/^(2[3-5]\d|4[0-2]\d)$/.test(s.slice(0, 3))) return [3, null];
  return [4, null];
}

/** Raw GS1 element string ("0108901…17270214" with separators) → { ai: value }. */
function splitRaw(text) {
  const out = {};
  let s = text.replace(/^\][A-Za-z]\d/, '');
  while (s.length) {
    if (s[0] === GS) { s = s.slice(1); continue; }
    const [aiLen, dataLen] = aiAt(s);
    const ai = s.slice(0, aiLen);
    if (!/^\d+$/.test(ai)) return null;
    s = s.slice(aiLen);
    let value;
    if (dataLen) {
      value = s.slice(0, dataLen);
      if (value.length < dataLen) return null;
      s = s.slice(dataLen);
    } else {
      const end = s.indexOf(GS);
      value = end === -1 ? s : s.slice(0, end);
      s = end === -1 ? '' : s.slice(end + 1);
    }
    out[ai] = value;
  }
  return out;
}

/** "(01)0890…(17)270214(10)AB1" → { ai: value } */
function splitBracketed(text) {
  const out = {};
  const re = /\((\d{2,4})\)([^(]*)/g;
  let m;
  while ((m = re.exec(text))) out[m[1]] = m[2];
  return Object.keys(out).length ? out : null;
}

/** "https://id.gs1.org/01/0890…/10/B42?17=270630" → { ai: value } */
function splitDigitalLink(text) {
  let url;
  try { url = new URL(text); } catch { return null; }
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const start = parts.findIndex((p, i) => ['01', '02', '00'].includes(p) && /^\d{8,14}$/.test(parts[i + 1] || ''));
  if (start === -1) return null;
  const out = {};
  for (let i = start; i + 1 < parts.length; i += 2) if (/^\d{2,4}$/.test(parts[i])) out[parts[i]] = parts[i + 1];
  for (const [key, value] of url.searchParams) if (/^\d{2,4}$/.test(key)) out[key] = value;
  return out;
}

/** GS1 / EAN check digit. Works for 8, 12, 13 and 14 digits. */
export function validCheckDigit(code) {
  if (!/^\d{8,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** GS1 YYMMDD → "YYYY-MM-DD". Day 00 means the last day of the month. */
function gs1Date(value) {
  const m = /^(\d\d)(\d\d)(\d\d)$/.exec(value || '');
  if (!m) return undefined;
  const year = 2000 + Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return undefined;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Number(m[3]) || last;
  if (day > last) return undefined;
  return `${year}-${m[2]}-${String(day).padStart(2, '0')}`;
}

/** The product number as shops store it: EAN-13 when the GTIN-14 starts with 0. */
const retailCode = (gtin) => (gtin.startsWith('0') && validCheckDigit(gtin.slice(1)) ? gtin.slice(1) : gtin);

function fromAis(ais) {
  const gtin = ais['01'] || ais['02'];
  if (!gtin || !/^\d{14}$/.test(gtin) || !validCheckDigit(gtin)) return null;
  const out = { kind: 'gs1', code: retailCode(gtin), gtin };
  const mfg = gs1Date(ais['11']) || gs1Date(ais['13']);
  const expiry = gs1Date(ais['17']) || gs1Date(ais['15']) || gs1Date(ais['16']);
  if (mfg) out.mfgDate = mfg;
  if (expiry) out.expiryDate = expiry;
  if (ais['10']) out.batch = ais['10'].slice(0, 40);
  for (const [ai, value] of Object.entries(ais)) {
    const amount = /^392(\d)$/.exec(ai) ? value : /^393(\d)$/.exec(ai) ? value.slice(3) : null;
    if (amount && /^\d+$/.test(amount)) out.price = Number(amount) / 10 ** Number(ai[3]);
  }
  return out;
}

/**
 * Reads a scanned code. Always returns `{ code, kind }`; `code` is what to match
 * products on. GS1 codes add `gtin` and, when present, `batch`, `mfgDate`,
 * `expiryDate` (ISO dates) and `price` (rupees).
 */
export function parseBarcode(text, format = '') {
  const raw = String(text || '').trim().replace(/<GS>/gi, GS);
  if (/^\d{8}$|^\d{12,13}$/.test(raw) && validCheckDigit(raw)) {
    return { code: raw, gtin: raw.padStart(14, '0'), kind: 'retail' };
  }
  const looksRaw = raw.includes(GS) || /^\][A-Za-z]\d/.test(raw)
    || (/^(01|02)\d{14}\d{2}/.test(raw) && /DataMatrix|DataBar|Code128|QR|GS1/i.test(format));
  const ais = raw.startsWith('(') ? splitBracketed(raw)
    : /^https?:\/\//i.test(raw) ? splitDigitalLink(raw)
      : looksRaw || /^(01|02)\d{14}(1[0-7]|3\d)/.test(raw) ? splitRaw(raw) : null;
  return (ais && fromAis(ais)) || { code: raw, kind: 'other' };
}
