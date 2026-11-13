import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useToast } from './ToastContext';
import { SEED_PRODUCTS, seedProducts, generateSalesHistory, CATEGORIES } from '../data/seed';
import { computeStats } from '../lib/insights';
import i18n from '../i18n';
import { pname } from '../lib/format';

const InventoryContext = createContext(null);
export const useInventory = () => useContext(InventoryContext);

const KEYS = {
  products: 'sr2_products',
  sales: 'sr2_sales',
  bills: 'sr2_bills',
  pos: 'sr2_purchase_orders',
  meta: 'sr2_meta',
};

const load = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback();
  } catch { return fallback(); }
};
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } };

const freshMeta = () => ({ nextBill: 1025, nextPO: 101, nextSku: 1017 });

export const InventoryProvider = ({ children }) => {
  const { showToast } = useToast() || {};

  const [products, setProducts] = useState(() => {
    // Older saved demo data used seed barcodes with wrong check digits; fix them in place.
    const seedById = Object.fromEntries(SEED_PRODUCTS.map(p => [p.id, p.barcode]));
    return load(KEYS.products, seedProducts).map(p =>
      seedById[p.id] && p.barcode !== seedById[p.id] && p.barcode.slice(0, 12) === seedById[p.id].slice(0, 12)
        ? { ...p, barcode: seedById[p.id] } : p);
  });
  const [sales, setSales] = useState(() => load(KEYS.sales, () => generateSalesHistory(SEED_PRODUCTS)));
  const [bills, setBills] = useState(() => load(KEYS.bills, () => []));
  const [purchaseOrders, setPurchaseOrders] = useState(() => load(KEYS.pos, () => []));
  const [meta, setMeta] = useState(() => load(KEYS.meta, freshMeta));

  useEffect(() => save(KEYS.products, products), [products]);
  useEffect(() => save(KEYS.sales, sales), [sales]);
  useEffect(() => save(KEYS.bills, bills), [bills]);
  useEffect(() => save(KEYS.pos, purchaseOrders), [purchaseOrders]);
  useEffect(() => save(KEYS.meta, meta), [meta]);

  // Keep a ref so actions always see the latest state (fast repeated taps).
  const productsRef = useRef(products);
  productsRef.current = products;
  const metaRef = useRef(meta);
  metaRef.current = meta;

  const stats = useMemo(() => computeStats(products, sales), [products, sales]);
  const lowStockProducts = useMemo(() => products.filter(p => p.quantity <= (p.min ?? 0)), [products]);

  const byId = useCallback((id) => productsRef.current.find(p => p.id === id), []);
  const findByBarcode = useCallback((barcode) => productsRef.current.find(p => p.barcode === String(barcode).trim()), []);
  const findByCode = useCallback((code) => {
    const c = String(code).trim().toUpperCase();
    return productsRef.current.find(p => p.code?.toUpperCase() === c || p.id.toUpperCase() === c || p.barcode === c);
  }, []);

  /** Notify for products that just crossed their minimum. */
  const notifyLowStock = useCallback((changes) => {
    for (const ch of changes) {
      if (ch.after <= ch.min && ch.before > ch.min) {
        const p = productsRef.current.find(x => x.id === ch.productId) || ch;
        showToast?.(ch.after <= 0
          ? i18n.t('toast.outOfStock', { name: pname(p) })
          : i18n.t('toast.lowStock', { name: pname(p), qty: ch.after, min: ch.min }), 'error');
      }
    }
  }, [showToast]);

  /**
   * Complete a sale: validate, deduct stock, record bill + sales lines.
   * cart: [{ productId, qty }]
   */
  const checkout = useCallback((cart, payment = { method: 'cash' }) => {
    const current = productsRef.current;
    const lines = [];
    for (const item of cart) {
      const p = current.find(x => x.id === item.productId);
      if (!p) return { ok: false, error: i18n.t('billing.errNotFound') };
      if (item.qty > p.quantity) return { ok: false, error: i18n.t('billing.errStock', { name: pname(p), qty: p.quantity }) };
      lines.push({ p, qty: item.qty });
    }
    if (!lines.length) return { ok: false, error: i18n.t('billing.errEmpty') };

    const now = Date.now();
    const billNo = metaRef.current.nextBill;
    const billId = `B${billNo}`;
    const changes = lines.map(({ p, qty }) => ({ productId: p.id, name: p.name, names: p.names, before: p.quantity, after: p.quantity - qty, qty, min: p.min ?? 0 }));
    const items = lines.map(({ p, qty }) => ({ productId: p.id, name: p.name, names: p.names, code: p.code, qty, price: p.price, total: qty * p.price }));
    const total = items.reduce((s, i) => s + i.total, 0);
    const bill = { id: billId, billNo, date: now, items, total, payment, changes };

    setProducts(prev => prev.map(p => {
      const ch = changes.find(c => c.productId === p.id);
      return ch ? { ...p, quantity: ch.after } : p;
    }));
    setSales(prev => [...prev, ...items.map((it, i) => ({
      id: `${billId}-${i}`, billId, productId: it.productId, productName: it.name, qty: it.qty, price: it.price, total: it.total, date: now,
    }))]);
    setBills(prev => [bill, ...prev].slice(0, 500));
    setMeta(m => ({ ...m, nextBill: m.nextBill + 1 }));
    notifyLowStock(changes);
    return { ok: true, bill, changes };
  }, [notifyLowStock]);

  /**
   * Add stock (supplier invoice, purchase order, manual).
   * items: [{ productId, qty }] or [{ newProduct: {...}, qty }]
   */
  const receiveStock = useCallback((items) => {
    const current = productsRef.current;
    let nextSku = metaRef.current.nextSku;
    const created = [];
    const changes = [];
    const qtyById = {};
    for (const it of items) {
      const qty = Math.max(0, Math.round(Number(it.qty) || 0));
      if (!qty) continue;
      if (it.newProduct) {
        const np = it.newProduct;
        const id = `P${nextSku++}`;
        const product = {
          id, code: (np.code || np.name.replace(/[^A-Za-z]/g, '').slice(0, 3)).toUpperCase(),
          barcode: np.barcode || id, name: np.name, names: np.names || {}, category: CATEGORIES.includes(np.category) ? np.category : 'other',
          price: Number(np.price) || 0, quantity: qty, min: Number(np.min) || 5, coverDays: 7, addedAt: Date.now(),
          ...(np.needsReview ? { needsReview: true } : {}),
        };
        created.push(product);
        changes.push({ productId: id, name: product.name, names: product.names, before: 0, after: qty, qty, isNew: true });
      } else {
        qtyById[it.productId] = (qtyById[it.productId] || 0) + qty;
      }
    }
    for (const [id, qty] of Object.entries(qtyById)) {
      const p = current.find(x => x.id === id);
      if (p) changes.push({ productId: id, name: p.name, names: p.names, before: p.quantity, after: p.quantity + qty, qty });
    }
    setProducts(prev => [...prev.map(p => qtyById[p.id] ? { ...p, quantity: p.quantity + qtyById[p.id] } : p), ...created]);
    if (nextSku !== metaRef.current.nextSku) setMeta(m => ({ ...m, nextSku }));
    return changes;
  }, []);

  /** Used by the scan/manual Add Stock page. Matches by barcode, else creates. */
  const addProduct = useCallback((product) => {
    const existing = product.barcode && productsRef.current.find(p => p.barcode === product.barcode);
    if (existing) {
      receiveStock([{ productId: existing.id, qty: product.quantity || 1 }]);
      return { action: 'updated', product: existing };
    }
    const [ch] = receiveStock([{ newProduct: { ...product, min: product.min ?? product.reorderLevel ?? 5 }, qty: product.quantity || 1 }]);
    return { action: 'added', product: { ...product, id: ch?.productId } };
  }, [receiveStock]);

  const updateProduct = useCallback((id, patch) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  }, []);

  /* ── Purchase orders ── */
  const createPO = useCallback(({ supplier = '', items }) => {
    const poNo = metaRef.current.nextPO;
    const po = {
      id: `PO${poNo}`, poNo, supplier, status: 'draft', createdAt: Date.now(),
      items: items.map(i => ({ productId: i.productId, qty: Math.max(1, Math.round(i.qty)) })),
    };
    setPurchaseOrders(prev => [po, ...prev]);
    setMeta(m => ({ ...m, nextPO: m.nextPO + 1 }));
    return po;
  }, []);

  const updatePO = useCallback((id, patch) => {
    setPurchaseOrders(prev => prev.map(po => po.id === id ? { ...po, ...patch } : po));
  }, []);

  const deletePO = useCallback((id) => {
    setPurchaseOrders(prev => prev.filter(po => po.id !== id));
  }, []);

  const receivePO = useCallback((id) => {
    const po = purchaseOrdersRef.current.find(p => p.id === id);
    if (!po || po.status === 'received') return [];
    const changes = receiveStock(po.items);
    setPurchaseOrders(prev => prev.map(p => p.id === id ? { ...p, status: 'received', receivedAt: Date.now(), changes } : p));
    return changes;
  }, [receiveStock]);
  const purchaseOrdersRef = useRef(purchaseOrders);
  purchaseOrdersRef.current = purchaseOrders;

  /** Reverse a receiveStock() result (used by Undo after an automatic add). */
  const revertStock = useCallback((changes) => {
    const removeIds = new Set(changes.filter(c => c.isNew).map(c => c.productId));
    const minus = Object.fromEntries(changes.filter(c => !c.isNew).map(c => [c.productId, c.qty]));
    setProducts(prev => prev
      .filter(p => !removeIds.has(p.id))
      .map(p => minus[p.id] ? { ...p, quantity: Math.max(0, p.quantity - minus[p.id]) } : p));
  }, []);

  const resetDemo = useCallback(() => {
    setProducts(seedProducts());
    setSales(generateSalesHistory(SEED_PRODUCTS));
    setBills([]);
    setPurchaseOrders([]);
    setMeta(freshMeta());
  }, []);

  const totalInventoryValue = products.reduce((sum, p) => sum + p.price * p.quantity, 0);

  const value = {
    products, sales, bills, purchaseOrders, stats, lowStockProducts, totalInventoryValue, nextBillNo: meta.nextBill,
    byId, findByBarcode, findByCode, checkout, receiveStock, revertStock, addProduct, updateProduct,
    createPO, updatePO, deletePO, receivePO, resetDemo,
  };

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
};
