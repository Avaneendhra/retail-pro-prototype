// Loyal customers and quick-delivery orders: phone numbers, distance, who buys
// often, the personal order link, and the WhatsApp message. All pure, except
// for the random customer code and the browser's compression in the link.

const DAY = 86400000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0 or 1: easy to read out
export const LOYAL_VISITS = 4;      // bills in 30 days before a customer is suggested as loyal
export const LINK_ITEMS = 60;       // items carried in an order link

/** An Indian mobile number as its last 10 digits; '' when it is not one. */
export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  return digits.slice(-10);
}

/** Straight-line distance in km between two { lat, lng } points (haversine formula). */
export function distanceKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** phone → { visits, spent, last } over the last 30 days, from bills that carry a customer phone. */
export function visitsByPhone(bills, now = Date.now(), days = 30) {
  const since = now - days * DAY;
  const out = {};
  for (const b of bills) {
    const phone = b.customer?.phone;
    if (!phone || b.at < since) continue;
    const v = (out[phone] ??= { visits: 0, spent: 0, last: 0 });
    v.visits += 1;
    v.spent += b.total || 0;
    v.last = Math.max(v.last, b.at);
  }
  return out;
}

/** Frequent buyers who are not on the loyal list yet, most visits first. */
export function loyalSuggestions(customers, bills, now = Date.now()) {
  const loyal = new Set(customers.filter((c) => c.loyal).map((c) => c.phone));
  const names = Object.fromEntries(customers.map((c) => [c.phone, c.name]));
  return Object.entries(visitsByPhone(bills, now))
    .filter(([phone, v]) => v.visits >= LOYAL_VISITS && !loyal.has(phone))
    .sort((a, b) => b[1].visits - a[1].visits)
    .map(([phone, v]) => ({ phone, visits: v.visits, spent: v.spent, name: names[phone] || '' }));
}

/** The items an order link carries: in stock, best sellers first, as [id, name, price]. */
export function menuForLink(products, stats = {}, limit = LINK_ITEMS) {
  return products
    .filter((p) => p.quantity > 0 && p.price > 0)
    .sort((a, b) => (stats[b.id]?.avg7 || 0) - (stats[a.id]?.avg7 || 0))
    .slice(0, limit)
    .map((p) => [p.id, p.name, p.price]);
}

/** A random 8-character code for a customer's personal link. */
export function newCustomerCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => CODE_ALPHABET[b & 31]).join('');
}

/* ── the order link ───────────────────────────────────────────── */

const toBase64Url = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (text) => {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const canCompress = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

/** The order details as URL-safe text: "z" + compressed when the browser can, "j" + plain otherwise. */
export async function encodeOrder(order) {
  const bytes = new TextEncoder().encode(JSON.stringify(order));
  if (canCompress()) return `z${toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')))}`;
  return `j${toBase64Url(bytes)}`;
}

/** Reads text made by encodeOrder; null when it is not a valid order. */
export async function decodeOrder(text) {
  try {
    const kind = text[0];
    let bytes = fromBase64Url(text.slice(1));
    if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    else if (kind !== 'j') return null;
    const order = JSON.parse(new TextDecoder().decode(bytes));
    return order && order.v === 1 && Array.isArray(order.items) ? order : null;
  } catch {
    return null;
  }
}

/** The page address a customer opens. `base` is the app's own address, e.g. https://…/retail-pro-prototype/ */
export const orderPageUrl = (base, encoded) => `${base}#/order/${encoded}`;

/* ── WhatsApp ─────────────────────────────────────────────────── */

const rupees = (n) => `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN')}`;

/** The order as a WhatsApp message to the shop. */
export function orderMessage({ shop, name, code, lines, address = '', note = '', location = null, km = null }) {
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const out = [
    `Delivery order for ${shop}`,
    `From: ${name}${code ? ` (customer code ${code})` : ''}`,
    '',
    ...lines.map((l) => `${l.name} × ${l.qty} = ${rupees(l.qty * l.price)}`),
    '',
    `Total: ${rupees(total)}`,
  ];
  if (address) out.push(`Address: ${address}`);
  if (note) out.push(`Note: ${note}`);
  if (location) {
    out.push(`Location: https://maps.google.com/?q=${location.lat.toFixed(5)},${location.lng.toFixed(5)}`);
    if (km != null) out.push(`Distance from shop: ${km.toFixed(1)} km`);
  }
  return out.join('\n');
}

/** A link that opens WhatsApp to an Indian number with the text written in. */
export const whatsappLink = (phone, text) => `https://wa.me/91${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
