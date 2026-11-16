// Older versions kept everything in localStorage under sr2_* keys.
// readLegacy turns that into a dataset for the new store; clearLegacy removes
// the old copy once the new one has been saved.
import { SEED_PRODUCTS } from '../data/seed.js';
import { normalizeProduct, byCreation } from './ops.js';
import { dayBills } from './history.js';

const KEYS = {
  products: 'sr2_products',
  sales: 'sr2_sales',
  bills: 'sr2_bills',
  orders: 'sr2_purchase_orders',
  meta: 'sr2_meta',
  invoices: 'sr2_invoices',
};
const SETTINGS_KEY = 'sr2_settings';
const FIRST = { bill: 1025, po: 101, sku: 1017 };

const read = (ls, key) => {
  try {
    const raw = ls.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const list = (value) => (Array.isArray(value) ? value : []);
const defined = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null));
const newestFirst = (key) => (a, b) => b[key] - a[key];

/** The highest number at the end of these ids or numbers, plus one. */
const nextAfter = (values) => 1 + Math.max(0, ...values.map((value) => Number(String(value).match(/(\d+)$/)?.[1]) || 0));

// Early sample data had barcodes with a wrong check digit; put the right one back.
const SEED_BARCODES = new Map(SEED_PRODUCTS.map((p) => [p.id, p.barcode]));
function fixBarcode(product) {
  const right = SEED_BARCODES.get(product.id);
  const current = String(product.barcode || '');
  return right && current !== right && current.slice(0, 12) === right.slice(0, 12) ? right : product.barcode;
}

export function readLegacy(ls) {
  if (!ls) return null;
  const oldProducts = read(ls, KEYS.products);
  if (!Array.isArray(oldProducts)) return null;
  const now = Date.now();

  const products = oldProducts
    .filter((p) => p && p.id && p.name)
    .map((p) => normalizeProduct({ ...p, barcode: fixBarcode(p), needsReview: Boolean(p.needsReview), createdAt: p.addedAt ?? p.createdAt ?? now }, now))
    .sort(byCreation);

  const bills = list(read(ls, KEYS.bills))
    .filter((b) => b && b.id && list(b.items).length)
    .map((b) => ({
      id: b.id,
      billNo: String(b.billNo ?? b.id),
      at: b.date ?? b.at ?? now,
      total: b.total,
      payment: defined(b.payment || { method: 'cash' }),
      items: b.items.map((i) => defined({ productId: i.productId, name: i.name, names: i.names, code: i.code, qty: i.qty, price: i.price, total: i.total })),
    }));

  // Sales lines whose bill is no longer kept (and the generated history) become one summary bill per day.
  const kept = new Set(bills.map((b) => b.id));
  const loose = list(read(ls, KEYS.sales)).filter((line) => line && line.productId && !kept.has(line.billId));

  const purchaseOrders = list(read(ls, KEYS.orders))
    .filter((po) => po && po.id)
    .map((po) => defined({
      id: po.id, poNo: String(po.poNo ?? po.id), supplier: po.supplier || '', status: po.status || 'draft',
      createdAt: po.createdAt ?? now, items: list(po.items).map((i) => ({ productId: i.productId, qty: i.qty })),
      receivedAt: po.receivedAt, changes: po.changes,
    }));

  const seen = new Set();
  const invoices = list(read(ls, KEYS.invoices)).filter(Boolean).map((entry, index) => {
    const at = entry.at ?? now;
    const id = seen.has(at) ? `INVL${at}-${index}` : `INVL${at}`;
    seen.add(at);
    return { id, supplier: entry.supplier || '', invoiceNo: entry.invoiceNo || '', dateText: entry.date || '', units: entry.units || 0, count: entry.count || 0, at };
  });

  const meta = read(ls, KEYS.meta) || {};
  return {
    data: {
      products,
      bills: [...bills, ...dayBills(loose)].sort(newestFirst('at')),
      purchaseOrders: purchaseOrders.sort(newestFirst('createdAt')),
      invoices: invoices.sort(newestFirst('at')),
      shop: { name: read(ls, SETTINGS_KEY)?.shopName || 'My Store' },
    },
    outbox: [],
    cursor: 0,
    counters: {
      bill: Math.max(FIRST.bill, Number(meta.nextBill) || 0, nextAfter(bills.map((b) => b.billNo))),
      po: Math.max(FIRST.po, Number(meta.nextPO) || 0, nextAfter(purchaseOrders.map((po) => po.poNo))),
      sku: Math.max(FIRST.sku, Number(meta.nextSku) || 0, nextAfter(products.map((p) => p.id))),
    },
    device: { id: null, no: 0 },
  };
}

export function clearLegacy(ls) {
  if (!ls) return;
  for (const key of Object.values(KEYS)) {
    try { ls.removeItem(key); } catch { /* nothing to do: the new copy is already saved */ }
  }
}
