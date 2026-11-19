// The changes ("ops") a device can send, and the SQL each one becomes.
//
// Every op runs as: record it (applied = 0) → bump the shop's change counter →
// effects → mark it applied. Each effect is guarded by "this op is recorded and
// not yet applied", so sending an op twice does nothing the second time.
import { z } from 'zod';

export const MAX_IMPORT_ROWS = 100;

/* ── shapes ───────────────────────────────────────────────────── */

const Id = z.string().min(1).max(80).regex(/^[\w.:-]+$/);
const Time = z.number().int().min(0).max(8.64e15);
const Count = z.number().int().min(-1e9).max(1e9);
const Money = z.number().min(0).max(1e12);
// A date as printed on a pack: month ("2026-08") or day ("2026-08-15"), or empty when unknown.
const DateText = z.string().regex(/^(\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/, 'Use YYYY-MM or YYYY-MM-DD.');
const Names = z.record(z.string().max(8), z.string().max(160));
const Aliases = z.array(z.string().max(80)).max(40);

const productFields = {
  name: z.string().trim().min(1).max(160),
  names: Names,
  aliases: Aliases,
  code: z.string().max(24),
  barcode: z.string().max(64),
  category: z.string().max(40),
  price: Money,
  min: Count,
  coverDays: z.number().int().min(0).max(365),
  needsReview: z.boolean(),
  batch: z.string().trim().max(40),
  mfgDate: DateText,
  expiryDate: DateText,
};

const Product = z.object({
  id: Id,
  name: productFields.name,
  names: Names.default({}),
  aliases: Aliases.default([]),
  code: productFields.code.default(''),
  barcode: productFields.barcode.default(''),
  category: productFields.category.default('other'),
  price: Money.default(0),
  min: Count.default(0),
  coverDays: productFields.coverDays.default(7),
  quantity: Count.default(0),
  needsReview: z.boolean().default(false),
  batch: productFields.batch.default(''),
  mfgDate: DateText.default(''),
  expiryDate: DateText.default(''),
  createdAt: Time.optional(),
});

const ProductPatch = z.object(productFields).partial();

const BillItem = z.object({
  productId: Id,
  name: z.string().max(160),
  names: Names.optional(),
  code: z.string().max(24).optional(),
  qty: z.number().int().min(1).max(1e6),
  price: Money,
  total: Money,
});

const Phone = z.string().regex(/^\d{10}$/, 'Use a 10-digit mobile number.');
const Place = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export const CustomerCode = z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/);

const Bill = z.object({
  id: Id,
  billNo: z.string().min(1).max(24),
  at: Time,
  total: Money,
  payment: z.object({ method: z.string().min(1).max(20), received: z.number().nullish() }),
  items: z.array(BillItem).min(1).max(200),
  discount: Money.optional(),
  seed: z.boolean().optional(),
  customer: z.object({ phone: Phone, name: z.string().trim().max(80).optional() }).optional(),
});

// A new customer needs a phone and a code; saving an id that exists may send only what changed.
const Customer = z.object({
  id: Id,
  name: z.string().trim().max(80).optional(),
  phone: Phone.optional(),
  code: CustomerCode.optional(),
  loyal: z.boolean().optional(),
  source: z.string().max(20).optional(),
  location: Place.nullable().optional(),
  createdAt: Time.optional(),
});

const PoItem = z.object({ productId: Id, qty: z.number().int().min(1).max(1e6) });
const PoItems = z.array(PoItem).max(200);
const StockChange = z.object({
  productId: Id,
  name: z.string().max(160).optional(),
  names: Names.optional(),
  before: Count,
  after: Count,
  qty: Count,
  isNew: z.boolean().optional(),
});

const Po = z.object({
  id: Id,
  poNo: z.string().min(1).max(24),
  supplier: z.string().max(120).default(''),
  status: z.enum(['draft', 'sent', 'received']).default('draft'),
  items: PoItems,
  createdAt: Time,
  receivedAt: Time.nullish(),
  changes: z.array(StockChange).max(200).nullish(),
});

const PoPatch = z.object({
  supplier: z.string().max(120),
  status: z.enum(['draft', 'sent']), // receiving goes through po.receive
  items: PoItems,
}).partial();

const Invoice = z.object({
  id: Id,
  supplier: z.string().max(120).default(''),
  invoiceNo: z.string().max(60).default(''),
  dateText: z.string().max(40).default(''),
  units: Count.default(0),
  count: Count.default(0),
  at: Time,
});

const StockLine = z.object({ productId: Id, delta: Count });
const StockLines = z.array(StockLine).min(1).max(200);

const op = (type, shape) => z.object({ id: Id, type: z.literal(type), at: Time, ...shape });

const SCHEMAS = new Map([
  ['sale', op('sale', { bill: Bill })],
  // A supplier invoice made up only of new products has no stock lines of its own, but is still recorded.
  ['stock.move', op('stock.move', { lines: z.array(StockLine).max(200), reason: z.string().max(24).default(''), invoice: Invoice.optional() })
    .refine((o) => o.lines.length > 0 || o.invoice, { message: 'Nothing to move.', path: ['lines'] })],
  ['product.create', op('product.create', { product: Product })],
  ['product.update', op('product.update', { productId: Id, patch: ProductPatch })],
  ['product.delete', op('product.delete', { productId: Id })],
  ['po.create', op('po.create', { po: Po })],
  ['po.update', op('po.update', { poId: Id, patch: PoPatch })],
  ['po.receive', op('po.receive', { poId: Id, lines: StockLines, changes: z.array(StockChange).max(200).optional() })],
  ['po.delete', op('po.delete', { poId: Id })],
  ['shop.update', op('shop.update', {
    name: z.string().trim().min(1).max(80).optional(),
    phone: z.union([Phone, z.literal('')]).optional(),
    location: Place.nullable().optional(),
    radiusKm: z.number().min(0.5).max(50).optional(),
  }).refine((o) => ['name', 'phone', 'location', 'radiusKm'].some((k) => o[k] !== undefined), { message: 'Nothing to change.' })],
  ['customer.save', op('customer.save', { customer: Customer })],
  ['customer.delete', op('customer.delete', { customerId: Id })],
  ['order.update', op('order.update', { orderId: Id, patch: z.object({ status: z.enum(['accepted', 'declined']), billId: Id.optional() }) })],
  ['import', op('import', {
    products: z.array(Product).default([]),
    bills: z.array(Bill).default([]),
    purchaseOrders: z.array(Po).default([]),
    invoices: z.array(Invoice).default([]),
  }).refine(
    (o) => o.products.length + o.bills.length + o.purchaseOrders.length + o.invoices.length <= MAX_IMPORT_ROWS,
    { message: `At most ${MAX_IMPORT_ROWS} rows per import.` },
  )],
]);

const OWNER_ONLY = new Set(['shop.update', 'import']);

/** Checks one change sent by a device. Unknown fields are dropped. */
export function parseOp(raw) {
  const isObject = raw !== null && typeof raw === 'object' && !Array.isArray(raw);
  const id = isObject && Id.safeParse(raw.id).success ? raw.id : null;
  if (!isObject) return { ok: false, id, reason: 'invalid: not a change' };
  const schema = typeof raw.type === 'string' ? SCHEMAS.get(raw.type) : undefined;
  if (!schema) return { ok: false, id, reason: 'unknown_type' };
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, op: parsed.data };
  const issue = parsed.error.issues[0];
  return { ok: false, id, reason: `invalid: ${issue.path.join('.') || 'change'}: ${issue.message}`.slice(0, 200) };
}

/* ── SQL building blocks ──────────────────────────────────────── */
// In every statement ?1 is the shop and ?2 the op id.

const GUARD = 'EXISTS (SELECT 1 FROM ops WHERE shop_id = ?1 AND id = ?2 AND applied = 0)';
const SEQ = '(SELECT seq FROM shops WHERE id = ?1)';
const field = (key) => `json_extract(j.value, '$.${key}')`;

/**
 * Inserts many rows from one JSON array (?3), skipping ids that already exist.
 * One parameter per statement keeps well inside D1's 100-parameter limit.
 * `fixed` adds columns whose value is the same for every row: [column, sqlExpression].
 */
function insertRows(ctx, table, columns, rows, fixed = [], extraArgs = []) {
  const names = ['shop_id', ...columns, ...fixed.map(([column]) => column), 'seq'];
  const values = ['?1', ...columns.map(field), ...fixed.map(([, expression]) => expression), SEQ];
  return {
    sql: `INSERT OR IGNORE INTO ${table} (${names.join(', ')}) SELECT ${values.join(', ')} FROM json_each(?3) j WHERE ${GUARD}`,
    args: [ctx.shopId, ctx.opId, JSON.stringify(rows), ...extraArgs],
  };
}

const productStatement = (ctx, products) => insertRows(
  ctx, 'products',
  ['id', 'code', 'barcode', 'name', 'names', 'aliases', 'category', 'price', 'min_qty', 'cover_days', 'quantity', 'needs_review', 'created_at', 'batch', 'mfg_date', 'expiry_date'],
  products.map((p) => ({
    id: p.id, code: p.code, barcode: p.barcode, name: p.name, names: JSON.stringify(p.names), aliases: JSON.stringify(p.aliases),
    category: p.category, price: p.price, min_qty: p.min, cover_days: p.coverDays, quantity: p.quantity,
    needs_review: p.needsReview ? 1 : 0, created_at: p.createdAt ?? ctx.now, batch: p.batch, mfg_date: p.mfgDate, expiry_date: p.expiryDate,
  })),
  [['created_by', '?4']], [ctx.userId],
);

const billStatement = (ctx, bills) => insertRows(
  ctx, 'bills',
  ['id', 'bill_no', 'at', 'total', 'payment', 'items', 'seed', 'discount', 'customer'],
  bills.map((b) => ({
    id: b.id, bill_no: b.billNo, at: b.at, total: b.total, payment: JSON.stringify(b.payment), items: JSON.stringify(b.items), seed: b.seed ? 1 : 0, discount: b.discount || 0,
    customer: b.customer ? JSON.stringify(b.customer) : null,
  })),
  [['user_id', '?4'], ['device_no', '(SELECT device_no FROM devices WHERE shop_id = ?1 AND id = ?5)']], [ctx.userId, ctx.deviceId],
);

const poStatement = (ctx, orders) => insertRows(
  ctx, 'purchase_orders',
  ['id', 'po_no', 'supplier', 'status', 'items', 'changes', 'created_at', 'received_at'],
  orders.map((po) => ({
    id: po.id, po_no: po.poNo, supplier: po.supplier, status: po.status, items: JSON.stringify(po.items),
    changes: po.changes ? JSON.stringify(po.changes) : null, created_at: po.createdAt, received_at: po.receivedAt ?? null,
  })),
);

const invoiceStatement = (ctx, invoices) => insertRows(
  ctx, 'invoices',
  ['id', 'supplier', 'invoice_no', 'date_text', 'units', 'line_count', 'at'],
  invoices.map((i) => ({
    id: i.id, supplier: i.supplier, invoice_no: i.invoiceNo, date_text: i.dateText, units: i.units, line_count: i.count, at: i.at,
  })),
);

/** Adds each line's delta to its product. Stock is never set, only moved, so devices add up. */
function stockStatement(ctx, lines, extraGuard = '', extraArgs = []) {
  return {
    sql: `UPDATE products
          SET quantity = quantity + (SELECT COALESCE(SUM(${field('delta')}), 0) FROM json_each(?3) j WHERE ${field('productId')} = products.id),
              seq = ${SEQ}
          WHERE shop_id = ?1 AND deleted = 0
            AND id IN (SELECT ${field('productId')} FROM json_each(?3) j)
            AND ${GUARD}${extraGuard}`,
    args: [ctx.shopId, ctx.opId, JSON.stringify(lines), ...extraArgs],
  };
}

/** UPDATE of only the fields present in `patch`. `columns`: [patchKey, column, encode]. */
function patchStatement(ctx, table, rowId, patch, columns, where) {
  const args = [ctx.shopId, ctx.opId, rowId];
  const sets = [];
  for (const [key, column, encode] of columns) {
    if (patch[key] === undefined) continue;
    args.push(encode ? encode(patch[key]) : patch[key]);
    sets.push(`${column} = ?${args.length}`);
  }
  if (!sets.length) return [];
  return [{
    sql: `UPDATE ${table} SET ${sets.join(', ')}, seq = ${SEQ} WHERE shop_id = ?1 AND id = ?3 AND ${where} AND ${GUARD}`,
    args,
  }];
}

const json = (value) => JSON.stringify(value);
const flag = (value) => (value ? 1 : 0);

const PRODUCT_COLUMNS = [
  ['name', 'name'], ['names', 'names', json], ['aliases', 'aliases', json], ['code', 'code'], ['barcode', 'barcode'],
  ['category', 'category'], ['price', 'price'], ['min', 'min_qty'], ['coverDays', 'cover_days'], ['needsReview', 'needs_review', flag],
  ['batch', 'batch'], ['mfgDate', 'mfg_date'], ['expiryDate', 'expiry_date'],
];
const PO_COLUMNS = [['supplier', 'supplier'], ['status', 'status'], ['items', 'items', json]];
const PO_OPEN = "status <> 'received' AND deleted = 0";

/* ── what each op does ────────────────────────────────────────── */

const EFFECTS = {
  sale: (o, ctx) => [
    billStatement(ctx, [o.bill]),
    stockStatement(ctx, o.bill.items.map((item) => ({ productId: item.productId, delta: -item.qty }))),
  ],

  'stock.move': (o, ctx) => [
    stockStatement(ctx, o.lines),
    ...(o.invoice ? [invoiceStatement(ctx, [o.invoice])] : []),
  ],

  'product.create': (o, ctx) => [productStatement(ctx, [o.product])],

  'product.update': (o, ctx) => patchStatement(ctx, 'products', o.productId, o.patch, PRODUCT_COLUMNS, 'deleted = 0'),

  // The owner can remove any product; staff only one they added themselves (undoing a wrong scan).
  'product.delete': (o, ctx) => [{
    sql: `UPDATE products SET deleted = 1, seq = ${SEQ}
          WHERE shop_id = ?1 AND id = ?3 AND deleted = 0 AND (?4 = 'owner' OR created_by = ?5) AND ${GUARD}`,
    args: [ctx.shopId, ctx.opId, o.productId, ctx.role, ctx.userId],
  }],

  'po.create': (o, ctx) => [poStatement(ctx, [o.po])],

  'po.update': (o, ctx) => patchStatement(ctx, 'purchase_orders', o.poId, o.patch, PO_COLUMNS, PO_OPEN),

  // Stock first (only while the order is still open), then close the order.
  'po.receive': (o, ctx) => [
    stockStatement(ctx, o.lines, ` AND EXISTS (SELECT 1 FROM purchase_orders WHERE shop_id = ?1 AND id = ?4 AND ${PO_OPEN})`, [o.poId]),
    {
      sql: `UPDATE purchase_orders SET status = 'received', received_at = ?4, changes = ?5, seq = ${SEQ}
            WHERE shop_id = ?1 AND id = ?3 AND ${PO_OPEN} AND ${GUARD}`,
      args: [ctx.shopId, ctx.opId, o.poId, o.at, o.changes ? JSON.stringify(o.changes) : null],
    },
  ],

  'po.delete': (o, ctx) => [{
    sql: `UPDATE purchase_orders SET deleted = 1, seq = ${SEQ} WHERE shop_id = ?1 AND id = ?3 AND status = 'draft' AND deleted = 0 AND ${GUARD}`,
    args: [ctx.shopId, ctx.opId, o.poId],
  }],

  'shop.update': (o, ctx) => [{
    sql: `UPDATE shops SET name = COALESCE(?3, name), phone = COALESCE(?4, phone),
            location = CASE WHEN ?6 = 1 THEN ?5 ELSE location END, radius_km = COALESCE(?7, radius_km)
          WHERE id = ?1 AND ${GUARD}`,
    args: [ctx.shopId, ctx.opId, o.name ?? null, o.phone ?? null, o.location ? JSON.stringify(o.location) : null, o.location !== undefined ? 1 : 0, o.radiusKm ?? null],
  }],

  // A new customer is added only with a phone and a code; an existing one gets only the fields sent.
  'customer.save': (o, ctx) => {
    const c = o.customer;
    return [{
      sql: `INSERT INTO customers (shop_id, id, name, phone, code, loyal, source, location, created_at, seq)
            SELECT ?1, ?3, COALESCE(?4, ''), COALESCE(?5, ''), COALESCE(?6, ''), COALESCE(?7, 1), COALESCE(?8, 'manual'), ?9, ?10, ${SEQ}
            WHERE ${GUARD} AND ((?5 IS NOT NULL AND ?6 IS NOT NULL) OR EXISTS (SELECT 1 FROM customers WHERE shop_id = ?1 AND id = ?3))
            ON CONFLICT (shop_id, id) DO UPDATE SET
              name = COALESCE(?4, name), phone = COALESCE(?5, phone), code = COALESCE(?6, code), loyal = COALESCE(?7, loyal),
              location = CASE WHEN ?11 = 1 THEN ?9 ELSE location END, deleted = 0, seq = excluded.seq`,
      args: [
        ctx.shopId, ctx.opId, c.id, c.name ?? null, c.phone ?? null, c.code ?? null, c.loyal === undefined ? null : flag(c.loyal),
        c.source ?? null, c.location ? JSON.stringify(c.location) : null, c.createdAt ?? o.at, c.location !== undefined ? 1 : 0,
      ],
    }];
  },

  'customer.delete': (o, ctx) => [{
    sql: `UPDATE customers SET deleted = 1, seq = ${SEQ} WHERE shop_id = ?1 AND id = ?3 AND deleted = 0 AND ${GUARD}`,
    args: [ctx.shopId, ctx.opId, o.customerId],
  }],

  // A delivery order is answered once.
  'order.update': (o, ctx) => [{
    sql: `UPDATE delivery_orders SET status = ?4, bill_id = COALESCE(?5, bill_id), seq = ${SEQ}
          WHERE shop_id = ?1 AND id = ?3 AND status = 'new' AND ${GUARD}`,
    args: [ctx.shopId, ctx.opId, o.orderId, o.patch.status, o.patch.billId ?? null],
  }],

  // Rows a device had before it joined the shop. Imported bills never move stock:
  // the imported product quantities already include them.
  import: (o, ctx) => [
    ...(o.products.length ? [productStatement(ctx, o.products)] : []),
    ...(o.bills.length ? [billStatement(ctx, o.bills)] : []),
    ...(o.purchaseOrders.length ? [poStatement(ctx, o.purchaseOrders)] : []),
    ...(o.invoices.length ? [invoiceStatement(ctx, o.invoices)] : []),
  ],
};

// Bills and imports are stored in their own tables; keeping a second copy in the log would only double the storage.
const LOGGED_WITHOUT_PAYLOAD = new Set(['sale', 'import']);

/**
 * The statements that apply one parsed op, or `{ rejected }` when this user may not send it.
 * ctx: { shopId, userId, deviceId, role, now }
 */
export function statementsFor(o, ctx) {
  if (ctx.role !== 'owner' && OWNER_ONLY.has(o.type)) return { rejected: 'forbidden' };
  const scoped = { ...ctx, opId: o.id };
  const { id, type, at, ...payload } = o;
  return [
    {
      sql: `INSERT OR IGNORE INTO ops (shop_id, id, type, payload, at, received_at, user_id, device_id, applied)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0)`,
      args: [ctx.shopId, id, type, LOGGED_WITHOUT_PAYLOAD.has(type) ? null : JSON.stringify(payload), at, ctx.now, ctx.userId, ctx.deviceId],
    },
    { sql: `UPDATE shops SET seq = seq + 1 WHERE id = ?1 AND ${GUARD}`, args: [ctx.shopId, id] },
    ...EFFECTS[type](o, scoped),
    { sql: 'UPDATE ops SET applied = 1 WHERE shop_id = ?1 AND id = ?2 AND applied = 0', args: [ctx.shopId, id] },
  ];
}
