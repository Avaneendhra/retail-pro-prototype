import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '../i18n';
import { ToastProvider } from './ToastContext';
import { InventoryProvider, useInventory, useAccount } from './InventoryContext';
import { createBoot } from './boot';
import { createEngine } from '../store/engine';
import { memoryStorage } from '../store/storage';
import Billing from '../components/billing/Billing';
import StorageNotice from '../components/layout/StorageNotice';

const T = new Date(2026, 10, 16, 12).getTime();
const MILK = {
  id: 'P1', code: 'ML', barcode: '8901262010016', name: 'Milk 500ml', names: { te: 'పాలు 500ml' }, aliases: ['milk'], category: 'dairy',
  price: 30, min: 20, coverDays: 2, quantity: 40, needsReview: false, createdAt: T,
};
const shop = (overrides = {}) => () => ({
  data: { products: [{ ...MILK, ...overrides.milk }], bills: overrides.bills || [], purchaseOrders: [], invoices: [], shop: { name: 'My Store' } },
  outbox: [], cursor: 0, counters: { bill: 1025, po: 101, sku: 1017 }, device: { id: null, no: 0 },
});

const noServer = new Proxy({}, { get: () => async () => { throw Object.assign(new Error('offline'), { status: 0, code: 'network' }); } });

function makeEngine({ seed = shop(), storage = memoryStorage() } = {}) {
  let session = null;
  return createEngine({
    storage, seed, api: noServer, deviceId: 'device-test', defer: () => {},
    sessionStore: { get: () => session, set: (next) => { session = next; } },
  });
}

let latest;
function Probe() {
  latest = { inventory: useInventory(), account: useAccount() };
  return null;
}

async function renderApp(ui = <Probe />, options) {
  const engine = makeEngine(options);
  await engine.start();
  render(<MemoryRouter><ToastProvider><InventoryProvider engine={engine}>{ui}</InventoryProvider></ToastProvider></MemoryRouter>);
  return engine;
}

const stock = () => latest.inventory.products.map((p) => [p.id, p.quantity]);

it('shows a loading state, then the app', async () => {
  let finish;
  const boot = () => new Promise((resolve) => { finish = resolve; });
  render(<ToastProvider><InventoryProvider boot={boot}><p>the app</p></InventoryProvider></ToastProvider>);

  const loading = screen.getByRole('status');
  const shownEarly = screen.queryByText('the app');
  const engine = makeEngine();
  await engine.start();
  await act(async () => finish({ engine }));

  expect(loading).toHaveTextContent('Opening your shop');
  expect(shownEarly).toBe(null);
  expect(screen.getByText('the app')).toBeInTheDocument();
});

it('tapping a quick button and paying reduces stock and shows before and after', async () => {
  const user = userEvent.setup();
  const engine = await renderApp(<Billing />);

  await user.click(screen.getByRole('button', { name: /Milk 500ml/ }));
  await user.click(screen.getByRole('button', { name: /Milk 500ml/ }));
  await user.click(screen.getByRole('button', { name: /Complete payment/ }));

  const paid = screen.getByRole('dialog');
  expect(within(paid).getByText(/Bill #1025/)).toBeInTheDocument();
  expect(within(paid).getByText('40')).toBeInTheDocument();
  expect(within(paid).getByText('38')).toBeInTheDocument();
  expect(within(paid).getByText('−2')).toBeInTheDocument();
  const { data } = engine.getSnapshot();
  expect(data.products[0].quantity).toBe(38);
  expect(data.bills[0]).toMatchObject({ id: 'B1025', billNo: '1025', total: 60, payment: { method: 'cash' }, items: [{ productId: 'P1', name: 'Milk 500ml', code: 'ML', qty: 2, price: 30, total: 60 }] });
  expect(screen.getByText(/Bill #1026/)).toBeInTheDocument();
});

it('a sale that takes a product to its minimum raises a low-stock toast', async () => {
  const user = userEvent.setup();
  await renderApp(<Billing />, { seed: shop({ milk: { quantity: 21 } }) });

  await user.click(screen.getByRole('button', { name: /Milk 500ml/ }));
  await user.click(screen.getByRole('button', { name: /Complete payment/ }));

  expect(screen.getByRole('alert')).toHaveTextContent('Low stock: Milk 500ml has 20 left (minimum 20)');
});

it('refuses to sell more than is in stock, and an empty bill', async () => {
  await renderApp();
  let tooMany;
  let empty;

  act(() => {
    tooMany = latest.inventory.checkout([{ productId: 'P1', qty: 41 }]);
    empty = latest.inventory.checkout([]);
  });

  expect(tooMany).toEqual({ ok: false, error: 'Only 40 of Milk 500ml in stock' });
  expect(empty.ok).toBe(false);
  expect(stock()).toEqual([['P1', 40]]);
  expect(latest.inventory.nextBillNo).toBe('1025');
});

it('receiving a supplier invoice adds stock and records it in history', async () => {
  await renderApp();
  let changes;

  act(() => {
    changes = latest.inventory.receiveStock(
      [{ productId: 'P1', qty: 50 }, { newProduct: { name: 'Bread', price: 40, category: 'bakery' }, qty: 5 }],
      { reason: 'invoice', invoice: { supplier: 'ABC Distributors', invoiceNo: 'INV-1025', dateText: '16/11/2026' } },
    );
  });

  expect(changes).toEqual([
    { productId: 'P1017', name: 'Bread', names: {}, before: 0, after: 5, qty: 5, isNew: true },
    { productId: 'P1', name: 'Milk 500ml', names: MILK.names, before: 40, after: 90, qty: 50 },
  ]);
  expect(stock()).toEqual([['P1', 90], ['P1017', 5]]);
  expect(latest.inventory.products[1]).toMatchObject({ name: 'Bread', code: 'BRE', barcode: 'P1017', category: 'bakery', price: 40, min: 5 });
  expect(latest.inventory.invoices).toHaveLength(1);
  expect(latest.inventory.invoices[0]).toMatchObject({ supplier: 'ABC Distributors', invoiceNo: 'INV-1025', dateText: '16/11/2026', units: 55, count: 2 });
});

it('an invoice of only new products is still recorded', async () => {
  await renderApp();

  act(() => {
    latest.inventory.receiveStock([{ newProduct: { name: 'Soap', price: 25 }, qty: 12 }], { reason: 'invoice', invoice: { supplier: 'XYZ' } });
  });

  expect(latest.inventory.invoices[0]).toMatchObject({ supplier: 'XYZ', invoiceNo: '', units: 12, count: 1 });
});

it('undo after an automatic add restores stock', async () => {
  await renderApp();
  let first;
  let more;

  act(() => { first = latest.inventory.receiveStock([{ newProduct: { name: 'Wrong scan', price: 0, needsReview: true }, qty: 1 }, { productId: 'P1', qty: 1 }], { reason: 'scan' }); });
  act(() => { more = latest.inventory.receiveStock([{ productId: 'P1', qty: 1 }], { reason: 'scan' }); });
  const added = stock();
  act(() => { latest.inventory.revertStock([...first, ...more]); });

  expect(added).toEqual([['P1', 42], ['P1017', 1]]);
  expect(stock()).toEqual([['P1', 40]]);
});

it('editing a product sends the stock difference, not a new total', async () => {
  const engine = await renderApp();
  const dispatch = vi.spyOn(engine, 'dispatch');

  act(() => { latest.inventory.updateProduct('P1', { name: '  Milk 500 ml ', price: 32, min: 25.4, quantity: 45, needsReview: false }); });

  expect(dispatch.mock.calls.map(([type, payload]) => [type, payload])).toEqual([
    ['product.update', { productId: 'P1', patch: { name: 'Milk 500 ml', price: 32, min: 25, needsReview: false } }],
    ['stock.move', { reason: 'adjust', lines: [{ productId: 'P1', delta: 5 }] }],
  ]);
  expect(latest.inventory.products[0]).toMatchObject({ name: 'Milk 500 ml', price: 32, min: 25, quantity: 45 });
});

it('orders can be created, edited, received once, and drafts deleted', async () => {
  await renderApp();
  let po;
  let changes;
  let again;

  act(() => { po = latest.inventory.createPO({ items: [{ productId: 'P1', qty: 20.4 }] }); });
  act(() => { latest.inventory.updatePO(po.id, { supplier: 'ABC', status: 'sent' }); });
  act(() => { changes = latest.inventory.receivePO(po.id); });
  act(() => { again = latest.inventory.receivePO(po.id); });
  let draft;
  act(() => { draft = latest.inventory.createPO({ supplier: 'Later', items: [{ productId: 'P1', qty: 5 }] }); });
  act(() => { latest.inventory.deletePO(draft.id); });

  expect(po).toMatchObject({ id: 'PO101', poNo: '101', status: 'draft', supplier: '', items: [{ productId: 'P1', qty: 20 }] });
  expect(changes).toEqual([{ productId: 'P1', name: 'Milk 500ml', names: MILK.names, before: 40, after: 60, qty: 20 }]);
  expect(again).toEqual([]);
  expect(stock()).toEqual([['P1', 60]]);
  expect(latest.inventory.purchaseOrders).toHaveLength(1);
  expect(latest.inventory.purchaseOrders[0]).toMatchObject({ id: 'PO101', supplier: 'ABC', status: 'received', changes });
  expect(draft.id).toBe('PO102');
});

it('the sample history counts as sales but is not listed as bills', async () => {
  const line = { productId: 'P1', name: 'Milk 500ml', qty: 3, price: 30, total: 90 };
  const bills = [
    { id: 'B1024', billNo: '1024', at: T, total: 90, payment: { method: 'upi' }, items: [line] },
    { id: 'H20261115', billNo: 'H20261115', at: T - 86_400_000, total: 90, payment: { method: 'cash' }, items: [line], seed: true },
  ];
  await renderApp(<Probe />, { seed: shop({ bills }) });

  expect(latest.inventory.bills.map((b) => b.id)).toEqual(['B1024']);
  expect(latest.inventory.sales).toEqual([
    { id: 'B1024-0', billId: 'B1024', productId: 'P1', productName: 'Milk 500ml', qty: 3, price: 30, total: 90, date: T },
    { id: 'H20261115-0', billId: null, productId: 'P1', productName: 'Milk 500ml', qty: 3, price: 30, total: 90, date: T - 86_400_000 },
  ]);
  expect(latest.inventory.stats.P1.sold7).toBe(6);
});

it('the shop name belongs to the shop and can be changed', async () => {
  await renderApp();
  const before = latest.inventory.shopName;

  act(() => { latest.inventory.setShopName('  Lakshmi Kirana ') });

  expect(before).toBe('My Store');
  expect(latest.inventory.shopName).toBe('Lakshmi Kirana');
  expect(latest.inventory.mode).toBe('local');
});

it('says who is signed in and how syncing stands', async () => {
  await renderApp();

  expect(latest.account).toMatchObject({ ready: true, mode: 'local', account: null, storage: 'memory', saveError: null, apiAvailable: null });
  expect(latest.account.sync).toMatchObject({ status: 'off', pending: 0 });
  await act(async () => { await latest.account.checkServer(); });
  expect(latest.account.apiAvailable).toBe(false);
});

it('resetting brings the sample data back', async () => {
  await renderApp();
  act(() => { latest.inventory.checkout([{ productId: 'P1', qty: 5 }]); });

  await act(async () => { await latest.inventory.resetDemo(); });

  expect(stock()).toEqual([['P1', 40]]);
  expect(latest.inventory.bills).toEqual([]);
});

it('warns when the browser is not keeping the data', async () => {
  await renderApp(<StorageNotice />);

  expect(screen.getByRole('alert')).toHaveTextContent('This browser is not saving data');
});

it('warns when the last changes could not be saved', async () => {
  const storage = { ...memoryStorage(), kind: 'idb' };
  const engine = await renderApp(<><Probe /><StorageNotice /></>, { storage });
  const calm = screen.queryByRole('alert');

  storage.save = async () => { throw new Error('QuotaExceededError'); };
  await act(async () => {
    latest.inventory.checkout([{ productId: 'P1', qty: 1 }]);
    await engine.settled();
  });

  expect(calm).toBe(null);
  expect(screen.getByRole('alert')).toHaveTextContent('could not be saved on this device');
});

it('a second tab is told the app is already open', async () => {
  const env = { navigator: { locks: { request: async (name, options, callback) => callback(null) } }, localStorage: window.localStorage, indexedDB: undefined };
  render(<ToastProvider><InventoryProvider boot={createBoot({ env })}><p>the app</p></InventoryProvider></ToastProvider>);

  expect(await screen.findByText('stokd is already open')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  expect(screen.queryByText('the app')).toBe(null);
});

it('the first tab starts normally and keeps the lock', async () => {
  let held = null;
  const locks = { request: (name, options, callback) => { held = callback({ name }); return held; } };
  const env = { navigator: { locks, userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile' }, localStorage: window.localStorage, indexedDB: undefined };
  const boot = createBoot({ env });
  render(<ToastProvider><InventoryProvider boot={boot}><Probe /><p>the app</p></InventoryProvider></ToastProvider>);

  expect(await screen.findByText('the app')).toBeInTheDocument();
  expect(held).toBeInstanceOf(Promise);
  expect(latest.inventory.products).toHaveLength(16);
  expect(boot()).toBe(boot());
  expect(window.localStorage.getItem('stokd_device')).toMatch(/^d-[0-9a-f]{24}$/);
});

it('a shop that cannot be opened says so instead of showing an empty one', async () => {
  const boot = () => Promise.reject(new Error('The browser database is damaged.'));
  render(<ToastProvider><InventoryProvider boot={boot}><p>the app</p></InventoryProvider></ToastProvider>);

  expect(await screen.findByText('The shop data could not be opened')).toBeInTheDocument();
  expect(screen.queryByText('the app')).toBe(null);
});

it('stock received with a batch and dates keeps them on the product', async () => {
  await renderApp();

  act(() => {
    latest.inventory.receiveStock([
      { productId: 'P1', qty: 10, details: { batch: 'M9', mfgDate: '2026-11-10', expiryDate: '2026-11-13' } },
      { newProduct: { name: 'Amul Butter 100g', price: 58, batch: 'AB123', mfgDate: '2026-08', expiryDate: '2027-02' }, qty: 4 },
    ], { reason: 'scan' });
  });

  expect(latest.inventory.products[0]).toMatchObject({ quantity: 50, batch: 'M9', mfgDate: '2026-11-10', expiryDate: '2026-11-13' });
  expect(latest.inventory.products[1]).toMatchObject({ name: 'Amul Butter 100g', batch: 'AB123', mfgDate: '2026-08', expiryDate: '2027-02' });
});

it('dates that are not real dates are left out instead of breaking the sync', async () => {
  await renderApp();

  act(() => { latest.inventory.receiveStock([{ productId: 'P1', qty: 1, details: { mfgDate: '31/02/2026', expiryDate: '2027-02-30', batch: '  ' } }]); });

  const [milk] = latest.inventory.products;
  expect(milk.quantity).toBe(41);
  expect([milk.batch || '', milk.mfgDate || '', milk.expiryDate || '']).toEqual(['', '', '']);
});
