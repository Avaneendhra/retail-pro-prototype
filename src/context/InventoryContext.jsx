// What the screens use. The shop's data lives in the store engine (src/store);
// this file turns it into the `useInventory()` and `useAccount()` hooks and turns
// what the screens ask for (sell, receive stock, edit, order) into changes.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useToast } from './ToastContext';
import { bootApp } from './boot';
import { CATEGORIES } from '../data/seed';
import i18n from '../i18n';
import { pname } from '../lib/format';
import { computeStats } from '../lib/insights';
import { billId, billNo, poId, poNo, productId } from '../store/ids';
import { AlreadyOpen, Splash, StartError } from '../components/layout/StartScreens';

const InventoryContext = createContext(null);
const AccountContext = createContext(null);

export const useInventory = () => useContext(InventoryContext);
export const useAccount = () => useContext(AccountContext);

const CHECK_EVERY_MS = 20_000;

/* The server refuses values outside these shapes, so they are tidied before they are sent. */
const text = (value, max) => String(value ?? '').trim().slice(0, max);
const whole = (value, min = 0) => Math.max(min, Math.round(Number(value) || 0));
const money = (value) => Math.max(0, Number(value) || 0);
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const PRODUCT_FIELDS = {
  name: (v) => text(v, 160) || undefined,
  names: (v) => (v && typeof v === 'object' ? v : undefined),
  aliases: (v) => (Array.isArray(v) ? v : undefined),
  code: (v) => text(v, 24),
  barcode: (v) => text(v, 64),
  category: (v) => (CATEGORIES.includes(v) ? v : 'other'),
  price: money,
  min: (v) => whole(v),
  coverDays: (v) => Math.min(365, whole(v)),
  needsReview: Boolean,
};

function tidy(patch, fields) {
  const out = {};
  for (const [key, clean] of Object.entries(fields)) {
    if (patch[key] === undefined) continue;
    const value = clean(patch[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

const orderItems = (items) => (items || []).slice(0, 200).map((i) => ({ productId: i.productId, qty: whole(i.qty, 1) }));

function useShop(engine, data, numbers, mode, showToast) {
  const { products, purchaseOrders, invoices } = data;
  const current = useCallback(() => engine.getSnapshot().data, [engine]);

  // The sample history is kept as one summary bill a day: it counts as sales but is not a bill to list.
  const bills = useMemo(() => data.bills.filter((b) => !b.seed), [data.bills]);
  // A discount is spread over the bill's lines, so sales figures add up to what was actually paid.
  const sales = useMemo(() => data.bills.flatMap((b) => {
    const share = b.discount ? b.total / Math.max(1, b.total + b.discount) : 1;
    return b.items.map((item, index) => ({
      id: `${b.id}-${index}`, billId: b.seed ? null : b.id, productId: item.productId, productName: item.name,
      qty: item.qty, price: item.price, total: share === 1 ? item.total : Math.round(item.total * share * 100) / 100, date: b.at,
    }));
  }), [data.bills]);

  const stats = useMemo(() => computeStats(products, sales), [products, sales]);
  const lowStockProducts = useMemo(() => products.filter((p) => p.quantity <= (p.min ?? 0)), [products]);
  const totalInventoryValue = useMemo(() => products.reduce((sum, p) => sum + p.price * p.quantity, 0), [products]);

  const byId = useCallback((id) => current().products.find((p) => p.id === id), [current]);
  const findByBarcode = useCallback((barcode) => {
    const wanted = String(barcode).trim();
    return current().products.find((p) => p.barcode === wanted);
  }, [current]);
  const findByCode = useCallback((code) => {
    const c = String(code).trim().toUpperCase();
    return current().products.find((p) => p.code?.toUpperCase() === c || p.id.toUpperCase() === c || p.barcode === c);
  }, [current]);

  /** Tells the cashier about products that just crossed their minimum. */
  const notifyLowStock = useCallback((changes) => {
    for (const ch of changes) {
      if (ch.after <= ch.min && ch.before > ch.min) {
        showToast?.(ch.after <= 0
          ? i18n.t('toast.outOfStock', { name: pname(ch) })
          : i18n.t('toast.lowStock', { name: pname(ch), qty: ch.after, min: ch.min }), 'error');
      }
    }
  }, [showToast]);

  /** Completes a sale. cart: [{ productId, qty }]; `discount` is an amount in rupees taken off the total. */
  const checkout = useCallback((cart, payment = { method: 'cash' }, { discount = 0 } = {}) => {
    const stock = current().products;
    const lines = [];
    for (const item of cart) {
      const p = stock.find((x) => x.id === item.productId);
      if (!p) return { ok: false, error: i18n.t('billing.errNotFound') };
      if (item.qty > p.quantity) return { ok: false, error: i18n.t('billing.errStock', { name: pname(p), qty: p.quantity }) };
      lines.push({ p, qty: whole(item.qty, 1) });
    }
    if (!lines.length) return { ok: false, error: i18n.t('billing.errEmpty') };

    const { n, code } = engine.takeNumber('bill');
    const items = lines.map(({ p, qty }) => ({ productId: p.id, name: p.name, names: p.names, code: p.code, qty, price: p.price, total: qty * p.price }));
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const off = Math.min(subtotal, Math.round(money(discount) * 100) / 100);
    const bill = {
      id: billId(code, n), billNo: billNo(code, n), at: Date.now(),
      total: Math.round((subtotal - off) * 100) / 100,
      ...(off > 0 ? { discount: off } : {}),
      payment: { method: text(payment.method, 20) || 'cash', ...(Number(payment.received) > 0 ? { received: Number(payment.received) } : {}) },
      items,
    };
    const changes = lines.map(({ p, qty }) => ({ productId: p.id, name: p.name, names: p.names, before: p.quantity, after: p.quantity - qty, qty, min: p.min ?? 0 }));
    engine.dispatch('sale', { bill });
    notifyLowStock(changes);
    return { ok: true, bill, changes };
  }, [engine, current, notifyLowStock]);

  /**
   * Adds stock. items: [{ productId, qty }] or [{ newProduct: {...}, qty }].
   * `invoice` ({ supplier, invoiceNo, dateText }) records the supplier bill this stock came on.
   * Returns what changed, for "before → after" displays and for Undo.
   */
  const receiveStock = useCallback((items, { reason = 'manual', invoice = null } = {}) => {
    const stock = current().products;
    const created = [];
    const changes = [];
    const qtyById = new Map();
    for (const item of items) {
      const qty = whole(item.qty);
      if (!qty) continue;
      if (item.newProduct) {
        const np = item.newProduct;
        const name = text(np.name, 160);
        if (!name) continue;
        const { n, code } = engine.takeNumber('sku');
        const id = productId(code, n);
        const product = {
          id, name, names: np.names || {}, aliases: np.aliases || [],
          code: text(np.code || name.replace(/[^A-Za-z]/g, '').slice(0, 3), 24).toUpperCase(),
          barcode: text(np.barcode, 64) || id,
          category: CATEGORIES.includes(np.category) ? np.category : 'other',
          price: money(np.price), quantity: qty, min: whole(np.min) || 5, coverDays: 7,
          needsReview: Boolean(np.needsReview), createdAt: Date.now(),
        };
        created.push(product);
        changes.push({ productId: id, name, names: product.names, before: 0, after: qty, qty, isNew: true });
      } else {
        qtyById.set(item.productId, (qtyById.get(item.productId) || 0) + qty);
      }
    }
    const lines = [];
    for (const [id, qty] of qtyById) {
      const p = stock.find((x) => x.id === id);
      if (!p) continue;
      lines.push({ productId: id, delta: qty });
      changes.push({ productId: id, name: p.name, names: p.names, before: p.quantity, after: p.quantity + qty, qty });
    }

    for (const product of created) engine.dispatch('product.create', { product });
    const record = invoice && changes.length ? {
      id: newId('inv'), supplier: text(invoice.supplier, 120), invoiceNo: text(invoice.invoiceNo, 60), dateText: text(invoice.dateText, 40),
      units: changes.reduce((sum, ch) => sum + ch.qty, 0), count: changes.length, at: Date.now(),
    } : null;
    if (lines.length || record) engine.dispatch('stock.move', { reason, lines, ...(record ? { invoice: record } : {}) });
    return changes;
  }, [engine, current]);

  /** Reverses what receiveStock() returned (Undo after an automatic add). */
  const revertStock = useCallback((changes) => {
    const stock = current().products;
    const added = new Set(changes.filter((c) => c.isNew).map((c) => c.productId));
    const back = new Map();
    for (const c of changes) if (!added.has(c.productId)) back.set(c.productId, (back.get(c.productId) || 0) + c.qty);
    const lines = [];
    for (const [id, qty] of back) {
      const p = stock.find((x) => x.id === id);
      const take = p ? Math.min(qty, Math.max(0, p.quantity)) : 0;
      if (take > 0) lines.push({ productId: id, delta: -take });
    }
    if (lines.length) engine.dispatch('stock.move', { reason: 'undo', lines });
    for (const id of added) engine.dispatch('product.delete', { productId: id });
  }, [engine, current]);

  /** Matches by barcode and adds stock, or creates the product. */
  const addProduct = useCallback((product) => {
    const existing = product.barcode && current().products.find((p) => p.barcode === product.barcode);
    if (existing) {
      receiveStock([{ productId: existing.id, qty: product.quantity || 1 }]);
      return { action: 'updated', product: existing };
    }
    const [change] = receiveStock([{ newProduct: { ...product, min: product.min ?? product.reorderLevel ?? 5 }, qty: product.quantity || 1 }]);
    return { action: 'added', product: { ...product, id: change?.productId } };
  }, [current, receiveStock]);

  /** Edits a product. A new stock count is sent as the difference, so sales made meanwhile on other devices still count. */
  const updateProduct = useCallback((id, patch) => {
    const p = current().products.find((x) => x.id === id);
    if (!p) return;
    const fields = tidy(patch, PRODUCT_FIELDS);
    if (Object.keys(fields).length) engine.dispatch('product.update', { productId: id, patch: fields }, { coalesce: true });
    if (patch.quantity !== undefined) {
      const delta = whole(patch.quantity) - p.quantity;
      if (delta) engine.dispatch('stock.move', { reason: 'adjust', lines: [{ productId: id, delta }] });
    }
  }, [engine, current]);

  const createPO = useCallback(({ supplier = '', items }) => {
    const { n, code } = engine.takeNumber('po');
    const po = { id: poId(code, n), poNo: poNo(code, n), supplier: text(supplier, 120), status: 'draft', createdAt: Date.now(), items: orderItems(items) };
    engine.dispatch('po.create', { po });
    return po;
  }, [engine]);

  const updatePO = useCallback((id, patch) => {
    const fields = tidy(patch, {
      supplier: (v) => String(v ?? '').slice(0, 120),
      status: (v) => (v === 'draft' || v === 'sent' ? v : undefined),
      items: orderItems,
    });
    if (Object.keys(fields).length) engine.dispatch('po.update', { poId: id, patch: fields }, { coalesce: true });
  }, [engine]);

  const deletePO = useCallback((id) => { engine.dispatch('po.delete', { poId: id }); }, [engine]);

  /** Marks an order received and adds its quantities to stock (once, whoever receives it first). */
  const receivePO = useCallback((id) => {
    const { products: stock, purchaseOrders: orders } = current();
    const po = orders.find((o) => o.id === id);
    if (!po || po.status === 'received' || !po.items.length) return [];
    const qtyById = new Map();
    for (const item of po.items) qtyById.set(item.productId, (qtyById.get(item.productId) || 0) + whole(item.qty));
    const lines = [];
    const changes = [];
    for (const [pid, qty] of qtyById) {
      if (!qty) continue;
      lines.push({ productId: pid, delta: qty });
      const p = stock.find((x) => x.id === pid);
      if (p) changes.push({ productId: pid, name: p.name, names: p.names, before: p.quantity, after: p.quantity + qty, qty });
    }
    if (!lines.length) return [];
    engine.dispatch('po.receive', { poId: id, lines, changes });
    return changes;
  }, [engine, current]);

  const setShopName = useCallback((name) => {
    engine.dispatch('shop.update', { name: text(name, 80) || 'My Store' });
  }, [engine]);

  const resetDemo = useCallback(() => engine.resetLocal(), [engine]);

  return useMemo(() => ({
    products, sales, bills, purchaseOrders, invoices, stats, lowStockProducts, totalInventoryValue,
    nextBillNo: billNo(numbers.code, numbers.bill), shopName: data.shop.name, mode,
    byId, findByBarcode, findByCode, checkout, receiveStock, revertStock, addProduct, updateProduct,
    createPO, updatePO, deletePO, receivePO, setShopName, resetDemo,
  }), [
    products, sales, bills, purchaseOrders, invoices, stats, lowStockProducts, totalInventoryValue, numbers.code, numbers.bill, data.shop.name, mode,
    byId, findByBarcode, findByCode, checkout, receiveStock, revertStock, addProduct, updateProduct,
    createPO, updatePO, deletePO, receivePO, setShopName, resetDemo,
  ]);
}

function Shop({ engine, children }) {
  const { showToast } = useToast() || {};
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const [apiAvailable, setApiAvailable] = useState(null);

  // Check for other devices' changes regularly, and at once when the network or the app comes back.
  useEffect(() => {
    const check = () => { engine.tick(); };
    const whenVisible = () => { if (document.visibilityState === 'visible') check(); };
    const timer = setInterval(check, CHECK_EVERY_MS);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', whenVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', whenVisible);
    };
  }, [engine]);

  const inventory = useShop(engine, snapshot.data, snapshot.numbers, snapshot.mode, showToast);

  const checkServer = useCallback(async () => {
    const ok = await engine.checkServer();
    setApiAvailable(ok);
    return ok;
  }, [engine]);

  const account = useMemo(() => ({
    ready: snapshot.ready, mode: snapshot.mode, account: snapshot.account, sync: snapshot.sync,
    storage: snapshot.storage, saveError: snapshot.saveError,
    apiAvailable: snapshot.mode === 'account' ? true : apiAvailable, checkServer,
    signUp: engine.signUp, signIn: engine.signIn, recover: engine.recover, signOut: engine.signOut,
    changePassword: engine.changePassword, syncNow: engine.syncNow, team: engine.team,
    retryRejected: engine.retryRejected, discardRejected: engine.discardRejected,
  }), [snapshot.ready, snapshot.mode, snapshot.account, snapshot.sync, snapshot.storage, snapshot.saveError, apiAvailable, checkServer, engine]);

  if (!snapshot.ready) return <Splash />;
  return (
    <AccountContext.Provider value={account}>
      <InventoryContext.Provider value={inventory}>{children}</InventoryContext.Provider>
    </AccountContext.Provider>
  );
}

/**
 * Starts the store and provides it to the screens.
 * Tests pass a ready-made `engine`, or their own `boot`.
 */
export function InventoryProvider({ engine, boot = bootApp, children }) {
  const [started, setStarted] = useState(null);

  useEffect(() => {
    if (engine) return undefined;
    let alive = true;
    boot().then(
      (result) => { if (alive) setStarted(result); },
      (error) => { if (alive) setStarted({ error }); },
    );
    return () => { alive = false; };
  }, [engine, boot]);

  const active = engine || started?.engine;
  if (active) return <Shop engine={active}>{children}</Shop>;
  if (started?.blocked) return <AlreadyOpen />;
  if (started?.error) return <StartError error={started.error} />;
  return <Splash />;
}
