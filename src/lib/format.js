import i18n from '../i18n';

export const inr = (n) => '₹' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-IN');

/** Product name in the current UI language (falls back to English). */
export const pname = (product, lang = i18n.language) =>
  (product && (product.names?.[lang] || product.name)) || '';

const LOCALE = { en: 'en-IN', te: 'te-IN', hi: 'hi-IN', mr: 'mr-IN' };
export const locale = (lang = i18n.language) => LOCALE[lang] || 'en-IN';

export const fmtDate = (ts, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(ts).toLocaleDateString(locale(), opts);

export const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });

export const weekdayShort = (ts) =>
  new Date(ts).toLocaleDateString(locale(), { weekday: 'short' });
