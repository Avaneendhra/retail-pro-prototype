// Pack dates on screen: how long until expiry, and reading what a person types.
import { readDate } from './labelDetails.js';

const DAY = 86_400_000;
export const SOON_DAYS = 30;

/** The last moment a pack is good: the given day, or the end of the given month. */
function lastDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return d ? new Date(y, m - 1, d) : new Date(y, m, 0);
}

/** { status: 'expired' | 'soon' | 'ok', days } for an expiry date, or null when there is none. */
export function expiryInfo(expiryDate, now = Date.now()) {
  if (!expiryDate) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((lastDay(expiryDate) - today) / DAY);
  return { status: days < 0 ? 'expired' : days <= SOON_DAYS ? 'soon' : 'ok', days };
}

/** What a person typed → ISO ("2026-08" or "2026-08-15"); '' for empty, null when it is not a date. */
export function readDateInput(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(s)) return s;
  return readDate(s) || null;
}

/** ISO → how it is typed in India: 15/08/2026 or 08/2026. */
export function dateInputText(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d ? `${d}/${m}/${y}` : `${m}/${y}`;
}
