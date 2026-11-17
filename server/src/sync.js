// POST /api/sync: a device sends its changes and receives the shop's.
//
// Everything happens in one atomic batch: register the device, apply the
// changes, then read every row that changed after the device's cursor.
import { z } from 'zod';
import { requireUser, readBody, deviceIdField, deviceStatements, publicDevice, signToken, parseJson } from './auth.js';
import { parseOp, statementsFor } from './ops.js';

export const MAX_OPS = 25;
export const PAGE = 500;
const TOKEN_REFRESH_MS = 24 * 60 * 60_000;

const Counter = z.number().int().min(0).max(1e9);
const Timestamp = z.number().int().min(0).max(8.64e15);

const SyncBody = z.object({
  deviceId: deviceIdField,
  since: z.number().int().min(0).default(0),
  billsSince: Timestamp.default(0),
  counters: z.object({ bill: Counter.default(0), po: Counter.default(0), sku: Counter.default(0) }).optional(),
  ops: z.array(z.unknown()).max(MAX_OPS).default([]),
});

/* ── rows → what the app uses ─────────────────────────────────── */

const productRow = (r) => (r.deleted ? { id: r.id, deleted: true } : {
  id: r.id, code: r.code, barcode: r.barcode, name: r.name, names: parseJson(r.names, {}), aliases: parseJson(r.aliases, []),
  category: r.category, price: r.price, min: r.min_qty, coverDays: r.cover_days, quantity: r.quantity,
  needsReview: Boolean(r.needs_review), createdAt: r.created_at,
});

const billRow = (r) => ({
  id: r.id, billNo: r.bill_no, at: r.at, total: r.total, payment: parseJson(r.payment, {}), items: parseJson(r.items, []),
  deviceNo: r.device_no, userId: r.user_id, ...(r.seed ? { seed: true } : {}), ...(r.discount ? { discount: r.discount } : {}),
});

const poRow = (r) => (r.deleted ? { id: r.id, deleted: true } : {
  id: r.id, poNo: r.po_no, supplier: r.supplier, status: r.status, items: parseJson(r.items, []), createdAt: r.created_at,
  ...(r.received_at ? { receivedAt: r.received_at } : {}),
  ...(r.changes ? { changes: parseJson(r.changes, []) } : {}),
});

const invoiceRow = (r) => ({
  id: r.id, supplier: r.supplier, invoiceNo: r.invoice_no, dateText: r.date_text, units: r.units, count: r.line_count, at: r.at,
});

/**
 * Reads of everything after `since` (?2). One row more than a page is fetched so a
 * cut-off table can be noticed. A device starting from nothing is not told about
 * rows that were already deleted.
 */
function pullStatements(shopId, since, billsSince) {
  const page = `ORDER BY seq, id LIMIT ${PAGE + 1}`;
  return [
    { sql: `SELECT * FROM products WHERE shop_id = ?1 AND seq > ?2 AND (deleted = 0 OR ?2 > 0) ${page}`, args: [shopId, since] },
    { sql: `SELECT * FROM bills WHERE shop_id = ?1 AND seq > ?2 AND at >= ?3 ${page}`, args: [shopId, since, billsSince] },
    { sql: `SELECT * FROM purchase_orders WHERE shop_id = ?1 AND seq > ?2 AND (deleted = 0 OR ?2 > 0) ${page}`, args: [shopId, since] },
    { sql: `SELECT * FROM invoices WHERE shop_id = ?1 AND seq > ?2 ${page}`, args: [shopId, since] },
  ];
}

/**
 * The cursor a device may move to. Rows changed together share a `seq`, so a table
 * that did not fit in one page is cut just before the first `seq` it could not finish.
 */
function safeCursor(shopSeq, tables) {
  let cursor = shopSeq;
  for (const rows of tables) {
    if (rows.length > PAGE) cursor = Math.min(cursor, rows[PAGE].seq - 1);
  }
  return cursor;
}

/** Keeps a device's highest bill, order and product numbers, so numbering continues after signing in again. */
function counterStatement(shopId, deviceId, counters, at) {
  const stored = (key) => `COALESCE(json_extract(counters, '$.${key}'), 0)`;
  return {
    sql: `UPDATE devices
          SET counters = json_object('bill', MAX(${stored('bill')}, ?3), 'po', MAX(${stored('po')}, ?4), 'sku', MAX(${stored('sku')}, ?5)),
              last_seen = ?6
          WHERE shop_id = ?1 AND id = ?2 AND (${stored('bill')} < ?3 OR ${stored('po')} < ?4 OR ${stored('sku')} < ?5)`,
    args: [shopId, deviceId, counters.bill, counters.po, counters.sku, at],
  };
}

export function syncRoutes(app) {
  app.post('/api/sync', requireUser, async (c) => {
    const { db, config, now } = c.get('ctx');
    const user = c.get('user');
    const body = await readBody(c, SyncBody);
    const at = now();
    const opContext = { shopId: user.shopId, userId: user.id, deviceId: body.deviceId, role: user.role, now: at };

    const accepted = [];
    const rejected = [];
    const [registerDevice, readDevice] = deviceStatements(user.shopId, body.deviceId, '', at);
    const statements = [registerDevice];
    if (body.counters) statements.push(counterStatement(user.shopId, body.deviceId, body.counters, at));

    for (const raw of body.ops) {
      const parsed = parseOp(raw);
      if (!parsed.ok) {
        rejected.push({ id: parsed.id, reason: parsed.reason });
        continue;
      }
      if (accepted.includes(parsed.op.id)) continue; // the same change twice in one request
      const result = statementsFor(parsed.op, opContext);
      if (!Array.isArray(result)) {
        rejected.push({ id: parsed.op.id, reason: result.rejected });
        continue;
      }
      accepted.push(parsed.op.id);
      statements.push(...result);
    }

    const reads = [
      { sql: 'SELECT id, name, seq FROM shops WHERE id = ?1', args: [user.shopId] },
      readDevice,
      ...pullStatements(user.shopId, body.since, body.billsSince),
    ];
    const results = await db.batch([...statements, ...reads]);
    const [[shop], [device], products, bills, orders, invoices] = results.slice(-reads.length).map((r) => r.rows);

    const cursor = safeCursor(shop.seq, [products, bills, orders, invoices]);
    const upTo = (rows) => rows.filter((r) => r.seq <= cursor);
    const token = at - c.get('tokenIssuedAt') >= TOKEN_REFRESH_MS
      ? await signToken({ userId: user.id, shopId: user.shopId, tokenVersion: user.tokenVersion }, config.jwtSecret, at)
      : undefined;

    return c.json({
      accepted,
      rejected,
      cursor,
      more: cursor < shop.seq,
      changes: {
        products: upTo(products).map(productRow),
        bills: upTo(bills).map(billRow),
        purchaseOrders: upTo(orders).map(poRow),
        invoices: upTo(invoices).map(invoiceRow),
      },
      shop: { id: shop.id, name: shop.name },
      user: { id: user.id, name: user.name, login: user.login, role: user.role },
      device: publicDevice(device),
      ...(token ? { token } : {}),
    });
  });
}
