// What each change ("op") does to the shop's data on this device.
// The server applies the same changes with the same rules (server/src/ops.js);
// the two must stay in step. Everything here is pure: data in, new data out,
// and the very same object back when nothing changed.

export const emptyData = () => ({ products: [], bills: [], purchaseOrders: [], invoices: [], customers: [], orders: [], shop: { name: '' } });

export const emptyDataset = ({ device = { id: null, no: 0 }, counters = { bill: 1, po: 1, sku: 1 } } = {}) => ({
  data: emptyData(),
  outbox: [],
  cursor: 0,
  counters,
  device,
});

const PRODUCT_DEFAULTS = {
  code: '', barcode: '', names: {}, aliases: [], category: 'other', price: 0, min: 0, coverDays: 7, quantity: 0, needsReview: false,
  batch: '', mfgDate: '', expiryDate: '',
};
const PRODUCT_KEYS = ['id', 'code', 'barcode', 'name', 'names', 'aliases', 'category', 'price', 'min', 'coverDays', 'quantity', 'needsReview', 'createdAt', 'batch', 'mfgDate', 'expiryDate'];
const PRODUCT_PATCH_KEYS = ['name', 'names', 'aliases', 'code', 'barcode', 'category', 'price', 'min', 'coverDays', 'needsReview', 'batch', 'mfgDate', 'expiryDate'];
const PO_PATCH_KEYS = ['supplier', 'status', 'items'];
const CUSTOMER_KEYS = ['id', 'name', 'phone', 'code', 'loyal', 'source', 'location', 'createdAt'];
const CUSTOMER_DEFAULTS = { name: '', phone: '', code: '', loyal: false, source: 'manual', location: null };
const SHOP_KEYS = ['name', 'phone', 'location', 'radiusKm'];

const pick = (source, keys) => {
  const out = {};
  for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
  return out;
};

/** A product as the app keeps it: every field present, nothing extra. */
export const normalizeProduct = (product, at) =>
  pick({ ...PRODUCT_DEFAULTS, createdAt: at, ...pick(product, PRODUCT_KEYS) }, PRODUCT_KEYS);

const normalizePo = (po) => ({ supplier: '', status: 'draft', ...po });

/** Adds each line's amount to its product. Unknown products are skipped. */
function moveStock(products, lines) {
  const deltas = new Map();
  for (const { productId, delta } of lines) deltas.set(productId, (deltas.get(productId) || 0) + delta);
  let changed = false;
  const next = products.map((p) => {
    const delta = deltas.get(p.id);
    if (!delta) return p;
    changed = true;
    return { ...p, quantity: p.quantity + delta };
  });
  return changed ? next : products;
}

/** Inserts into a list kept newest first by `key`. */
export function insertNewestFirst(rows, row, key) {
  const index = rows.findIndex((other) => other[key] <= row[key]);
  return index === -1 ? [...rows, row] : [...rows.slice(0, index), row, ...rows.slice(index)];
}

/** Products are always kept in the same order on every device: oldest first, then by id. */
export const byCreation = (a, b) => (a.createdAt - b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function addProduct(products, product) {
  const last = products[products.length - 1];
  const next = [...products, product];
  return last && byCreation(last, product) > 0 ? next.sort(byCreation) : next;
}

const has = (rows, id) => rows.some((row) => row.id === id);
const replace = (rows, id, change) => rows.map((row) => (row.id === id ? change(row) : row));

const HANDLERS = {
  sale(data, op) {
    if (has(data.bills, op.bill.id)) return data;
    return {
      ...data,
      bills: insertNewestFirst(data.bills, op.bill, 'at'),
      products: moveStock(data.products, op.bill.items.map((item) => ({ productId: item.productId, delta: -item.qty }))),
    };
  },

  'stock.move'(data, op) {
    const products = moveStock(data.products, op.lines);
    const addInvoice = op.invoice && !has(data.invoices, op.invoice.id);
    if (products === data.products && !addInvoice) return data;
    return { ...data, products, invoices: addInvoice ? insertNewestFirst(data.invoices, op.invoice, 'at') : data.invoices };
  },

  'product.create'(data, op) {
    if (has(data.products, op.product.id)) return data;
    return { ...data, products: addProduct(data.products, normalizeProduct(op.product, op.at)) };
  },

  'product.update'(data, op) {
    const patch = pick(op.patch, PRODUCT_PATCH_KEYS);
    if (!has(data.products, op.productId) || !Object.keys(patch).length) return data;
    return { ...data, products: replace(data.products, op.productId, (p) => ({ ...p, ...patch })) };
  },

  'product.delete'(data, op) {
    if (!has(data.products, op.productId)) return data;
    return { ...data, products: data.products.filter((p) => p.id !== op.productId) };
  },

  'po.create'(data, op) {
    if (has(data.purchaseOrders, op.po.id)) return data;
    return { ...data, purchaseOrders: insertNewestFirst(data.purchaseOrders, normalizePo(op.po), 'createdAt') };
  },

  'po.update'(data, op) {
    const po = data.purchaseOrders.find((o) => o.id === op.poId);
    const patch = pick(op.patch, PO_PATCH_KEYS);
    if (!po || po.status === 'received' || !Object.keys(patch).length) return data;
    return { ...data, purchaseOrders: replace(data.purchaseOrders, op.poId, (o) => ({ ...o, ...patch })) };
  },

  'po.receive'(data, op) {
    const po = data.purchaseOrders.find((o) => o.id === op.poId);
    if (!po || po.status === 'received') return data;
    return {
      ...data,
      products: moveStock(data.products, op.lines),
      purchaseOrders: replace(data.purchaseOrders, op.poId, (o) => ({
        ...o, status: 'received', receivedAt: op.at, ...(op.changes ? { changes: op.changes } : {}),
      })),
    };
  },

  'po.delete'(data, op) {
    const po = data.purchaseOrders.find((o) => o.id === op.poId);
    if (!po || po.status !== 'draft') return data;
    return { ...data, purchaseOrders: data.purchaseOrders.filter((o) => o.id !== op.poId) };
  },

  'shop.update'(data, op) {
    const patch = pick(op, SHOP_KEYS);
    if (Object.entries(patch).every(([key, value]) => JSON.stringify(data.shop[key]) === JSON.stringify(value))) return data;
    return { ...data, shop: { ...data.shop, ...patch } };
  },

  // Customers who may order for delivery. Saving an id that exists updates it.
  'customer.save'(data, op) {
    const customers = data.customers || [];
    const fields = pick(op.customer, CUSTOMER_KEYS);
    if (has(customers, fields.id)) return { ...data, customers: replace(customers, fields.id, (c) => ({ ...c, ...fields })) };
    return { ...data, customers: [{ ...CUSTOMER_DEFAULTS, createdAt: op.at, ...fields }, ...customers] };
  },

  'customer.delete'(data, op) {
    const customers = data.customers || [];
    if (!has(customers, op.customerId)) return data;
    return { ...data, customers: customers.filter((c) => c.id !== op.customerId) };
  },

  // A delivery order is accepted (it became a bill) or declined, once.
  'order.update'(data, op) {
    const orders = data.orders || [];
    const order = orders.find((o) => o.id === op.orderId);
    if (!order || order.status !== 'new') return data;
    return { ...data, orders: replace(orders, op.orderId, (o) => ({ ...o, ...pick(op.patch, ['status', 'billId']) })) };
  },

  // Rows this device had before it joined the shop. Imported bills do not move
  // stock: the imported product quantities already include them.
  import(data, op) {
    let next = data;
    const add = (key, rows, insert) => {
      for (const row of rows || []) {
        if (!has(next[key], row.id)) next = { ...next, [key]: insert(next[key], row) };
      }
    };
    add('products', op.products, (rows, p) => addProduct(rows, normalizeProduct(p, op.at)));
    add('bills', op.bills, (rows, b) => insertNewestFirst(rows, b, 'at'));
    add('purchaseOrders', op.purchaseOrders, (rows, o) => insertNewestFirst(rows, normalizePo(o), 'createdAt'));
    add('invoices', op.invoices, (rows, i) => insertNewestFirst(rows, i, 'at'));
    return next;
  },
};

/** Applies one change. Unknown kinds of change are ignored. */
export function applyOp(data, op) {
  const handler = Object.hasOwn(HANDLERS, op.type) ? HANDLERS[op.type] : null;
  return handler ? handler(data, op) : data;
}
