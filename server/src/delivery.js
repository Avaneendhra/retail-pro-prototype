// Quick delivery: the two addresses a loyal customer's order page calls. They
// need no sign-in; the secret code in the customer's personal link is what lets
// them in, and only for that one shop.
import { z } from 'zod';
import { readBody, parseJson } from './auth.js';
import { CustomerCode } from './ops.js';
import { fail } from './errors.js';

export const MAX_ORDERS_PER_DAY = 10;
const DAY_MS = 24 * 60 * 60_000;
const MENU_LIMIT = 300;

const Id = z.string().min(1).max(80).regex(/^[\w.:-]+$/);
const OrderBody = z.object({
  shop: Id,
  code: CustomerCode,
  name: z.string().trim().max(80).default(''),
  address: z.string().trim().max(300).default(''),
  note: z.string().trim().max(200).default(''),
  items: z.array(z.object({ productId: Id, qty: z.number().int().min(1).max(99) })).max(50),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
});

/** Straight-line distance in km (haversine formula), rounded to 10 m. */
function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h))) * 100) / 100;
}

/** The loyal customer a code belongs to, with their shop; a 404 for anything else. */
async function customerFor(db, shopId, code) {
  const rows = await db.query(
    `SELECT c.id, c.name, c.phone, s.name AS shop_name, s.phone AS shop_phone, s.location AS shop_location
     FROM customers c JOIN shops s ON s.id = c.shop_id
     WHERE c.shop_id = ? AND c.code = ? AND c.deleted = 0 AND c.loyal = 1`,
    [shopId, code],
  );
  if (!rows[0]) throw fail(404, 'not_found', 'This order link does not work. Ask the shop for a new one.');
  return rows[0];
}

const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(36).padStart(2, '0')).join('');

export function deliveryRoutes(app) {
  // Today's items and prices for a customer's order page.
  app.get('/api/public/menu', async (c) => {
    const { db } = c.get('ctx');
    const shopId = Id.safeParse(c.req.query('shop'));
    const code = CustomerCode.safeParse(c.req.query('code'));
    if (!shopId.success || !code.success) throw fail(404, 'not_found', 'This order link does not work. Ask the shop for a new one.');
    const customer = await customerFor(db, shopId.data, code.data);
    const products = await db.query(
      `SELECT id, name, price FROM products WHERE shop_id = ? AND deleted = 0 AND quantity > 0 AND price > 0 ORDER BY name LIMIT ${MENU_LIMIT}`,
      [shopId.data],
    );
    return c.json({
      shop: { name: customer.shop_name, phone: customer.shop_phone || '' },
      name: customer.name,
      items: products.map((p) => [p.id, p.name, p.price]),
    });
  });

  // An order from a customer's page. Prices and the phone number come from the shop's own records.
  app.post('/api/public/orders', async (c) => {
    const { db, now } = c.get('ctx');
    const body = await readBody(c, OrderBody);
    const at = now();
    const customer = await customerFor(db, body.shop, body.code);

    const [{ n }] = await db.query('SELECT COUNT(*) AS n FROM delivery_orders WHERE shop_id = ? AND customer_id = ? AND at > ?', [body.shop, customer.id, at - DAY_MS]);
    if (n >= MAX_ORDERS_PER_DAY) throw fail(429, 'too_many_orders', 'Too many orders today. Please call the shop.');

    const wanted = new Map();
    for (const item of body.items) wanted.set(item.productId, (wanted.get(item.productId) || 0) + item.qty);
    const known = wanted.size
      ? await db.query(
        'SELECT id, name, price FROM products WHERE shop_id = ? AND deleted = 0 AND id IN (SELECT value FROM json_each(?))',
        [body.shop, JSON.stringify([...wanted.keys()])],
      )
      : [];
    const items = known.map((p) => ({ productId: p.id, name: p.name, qty: Math.min(99, wanted.get(p.id)), price: p.price }));
    if (!items.length) throw fail(400, 'invalid_input', 'Pick at least one item.');

    const shopPlace = parseJson(customer.shop_location, null);
    const km = shopPlace && body.location ? distanceKm(shopPlace, body.location) : null;
    const id = `O${at.toString(36)}${randomId()}`;

    await db.batch([
      { sql: 'UPDATE shops SET seq = seq + 1 WHERE id = ?1', args: [body.shop] },
      {
        sql: `INSERT INTO delivery_orders (shop_id, id, customer_id, name, phone, items, address, note, location, km, status, at, seq)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'new', ?11, (SELECT seq FROM shops WHERE id = ?1))`,
        args: [
          body.shop, id, customer.id, body.name || customer.name, customer.phone, JSON.stringify(items),
          body.address, body.note, body.location ? JSON.stringify(body.location) : null, km, at,
        ],
      },
    ]);
    return c.json({ ok: true, id }, 201);
  });
}
