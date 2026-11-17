// The details printed on a pack that a product barcode does not hold:
// MRP, manufacturing / packing date, expiry or best-before date, batch number.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');
const fullYear = (y) => (y.length === 2 ? 2000 + Number(y) : Number(y));
const monthOf = (name) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;

function isoDay(year, month, day) {
  if (month < 1 || month > 12 || year < 2000 || year > 2099) return undefined;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= last ? `${year}-${pad(month)}-${pad(day)}` : undefined;
}
const isoMonth = (year, month) => (month >= 1 && month <= 12 && year >= 2000 && year <= 2099 ? `${year}-${pad(month)}` : undefined);

const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';

/** A date at the start of `s`, written the Indian way (day before month). */
export function readDate(s) {
  let m = s.match(/^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4}|\d{2})(?!\d)/);
  if (m) return isoDay(fullYear(m[3]), Number(m[2]), Number(m[1])) ?? null;
  m = s.match(new RegExp(`^(\\d{1,2})\\s*[ ./-]?\\s*${MON}\\s*[ ./,-]?\\s*(\\d{4}|\\d{2})(?!\\d)`, 'i'));
  if (m) return isoDay(fullYear(m[3]), monthOf(m[2]), Number(m[1])) ?? null;
  m = s.match(new RegExp(`^${MON}\\s*[ ./,-]?\\s*(\\d{4}|\\d{2})(?!\\d)`, 'i'));
  if (m) return isoMonth(fullYear(m[2]), monthOf(m[1])) ?? null;
  m = s.match(/^(\d{1,2})\s*[./-]\s*(\d{4}|\d{2})(?![\d./-])/);
  if (m) return isoMonth(fullYear(m[2]), Number(m[1])) ?? null;
  return null;
}

const MFG_WORDS = /\b(?:date\s*of\s*(?:mfg|manufacture|manufacturing|packing|packaging|pkg)|mfg\.?\s*date|mfd|mfgd|mfg|d\.?o\.?m|pkd|pkg\.?\s*date|packed\s*on|packing\s*date|manufactured\s*on)\b/gi;
const EXP_WORDS = /\b(?:exp(?:iry)?(?:\s*date)?|use\s*by|use\s*before|best\s*before|bbe|bb)\b/gi;

/** The first readable date that follows one of `words`. */
function dateAfter(text, words) {
  for (const m of text.matchAll(words)) {
    const rest = text.slice(m.index + m[0].length).replace(/^[\s.:;\-–]*(?:date|on)?[\s.:;\-–]*/i, '');
    const date = readDate(rest);
    if (date) return date;
    if (date === null && /^\d/.test(rest)) continue; // looked like a date but was not one
  }
  return undefined;
}

function addPeriod(date, amount, unit) {
  const [y, m, d] = date.split('-').map(Number);
  if (/^month/i.test(unit)) {
    const total = y * 12 + (m - 1) + amount;
    const year = Math.floor(total / 12);
    const month = (total % 12) + 1;
    if (!d) return `${year}-${pad(month)}`;
    return isoDay(year, month, Math.min(d, new Date(Date.UTC(year, month, 0)).getUTCDate()));
  }
  const days = new Date(Date.UTC(y, m - 1, d || 1) + amount * 86_400_000);
  return `${days.getUTCFullYear()}-${pad(days.getUTCMonth() + 1)}-${pad(days.getUTCDate())}`;
}

/** { mrp, mfgDate?, expiryDate?, batch? } from the text read off a label. Dates are ISO ("2026-08" or "2026-08-15"). */
export function parseLabelDetails(text) {
  const raw = String(text || '');
  const out = { mrp: 0 };

  const mrpMatch = raw.match(/M\.?\s*R\.?\s*P\.?[^\d]{0,15}(\d{1,5}(?:\.\d{1,2})?)/i)
    || raw.match(/(?:₹|Rs\.?|INR)\s*(\d{1,5}(?:\.\d{1,2})?)/i);
  if (mrpMatch) out.mrp = Math.round(parseFloat(mrpMatch[1]));

  const mfgDate = dateAfter(raw, MFG_WORDS);
  if (mfgDate) out.mfgDate = mfgDate;

  const relative = raw.match(/best\s*before\s*(\d{1,3})\s*(months?|days?)\s*(?:from|after)\s*(?:the\s*)?(?:date\s*of\s*)?(?:mfg|manufactur|pack|pkd|pkg)/i);
  const expiryDate = relative && mfgDate ? addPeriod(mfgDate, Number(relative[1]), relative[2]) : dateAfter(raw, EXP_WORDS);
  if (expiryDate) out.expiryDate = expiryDate;

  const batch = raw.match(/\b(?:batch|b\.?\s?no|lot)\b\s*(?:no|number)?\.?\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\-/]{1,19})/i);
  if (batch && /\d/.test(batch[1])) out.batch = batch[1].toUpperCase();

  return out;
}
