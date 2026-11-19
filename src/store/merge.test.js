import { it, expect } from 'vitest';
import { mergeChanges, pruneBills } from './merge.js';
import { emptyData } from './ops.js';

const T = Date.UTC(2026, 10, 16, 6);
const DAY = 86_400_000;

const product = (id, quantity) => ({ id, name: id, quantity });
const bill = (id, at) => ({ id, billNo: id, at, total: 10, payment: { method: 'cash' }, items: [] });
const order = (id, createdAt, status = 'draft') => ({ id, poNo: id, supplier: '', status, items: [], createdAt });
const invoice = (id, at) => ({ id, supplier: '', invoiceNo: id, dateText: '', units: 1, count: 1, at });
const ids = (rows) => rows.map((r) => r.id);
const NONE = { products: [], bills: [], purchaseOrders: [], invoices: [] };

it('merge replaces rows by id, removes deleted products, keeps bills newest first and drops bills older than billsSince', () => {
  const data = {
    ...emptyData(),
    products: [product('P1', 40), product('P2', 8), product('P3', 5)],
    bills: [bill('B2', T), bill('B1', T - 61 * DAY)],
  };

  const merged = mergeChanges(data, {
    ...NONE,
    products: [product('P1', 38), { id: 'P2', deleted: true }, product('P4', 1), { id: 'NEVER-SEEN', deleted: true }],
    bills: [bill('B3', T + 1000), bill('B0', T - 90 * DAY), { ...bill('B2', T), total: 99 }],
  }, { billsSince: T - 60 * DAY });

  expect(merged.products).toEqual([product('P1', 38), product('P3', 5), product('P4', 1)]);
  expect(ids(merged.bills)).toEqual(['B3', 'B2']);
  expect(merged.bills[1].total).toBe(99);
});

it('orders and invoices are replaced by id; deleted orders go; the newest come first', () => {
  const data = { ...emptyData(), purchaseOrders: [order('PO2', T), order('PO1', T - 1000)], invoices: [invoice('I1', T)] };

  const merged = mergeChanges(data, {
    ...NONE,
    purchaseOrders: [order('PO3', T + 1000), order('PO1', T - 1000, 'received'), { id: 'PO2', deleted: true }],
    invoices: [invoice('I2', T + 5), invoice('I0', T - 5)],
  }, { billsSince: 0 });

  expect(merged.purchaseOrders.map((o) => [o.id, o.status])).toEqual([['PO3', 'draft'], ['PO1', 'received']]);
  expect(ids(merged.invoices)).toEqual(['I2', 'I1', 'I0']);
});

it('merging nothing returns the same object', () => {
  const data = { ...emptyData(), products: [product('P1', 40)], bills: [bill('B1', T)] };

  expect(mergeChanges(data, NONE, { billsSince: T - DAY })).toBe(data);
  expect(mergeChanges(data, {}, { billsSince: 0 })).toBe(data);
});

it('rows that did not change keep their identity', () => {
  const data = { ...emptyData(), products: [product('P1', 40), product('P2', 8)], bills: [bill('B1', T)] };

  const merged = mergeChanges(data, { ...NONE, products: [product('P1', 39)] }, { billsSince: 0 });

  expect(merged.products[1]).toBe(data.products[1]);
  expect(merged.bills).toBe(data.bills);
});

it('pruneBills drops bills older than the cut-off and keeps the rest untouched', () => {
  const data = { ...emptyData(), bills: [bill('B2', T), bill('B1', T - 5 * DAY)] };

  expect(ids(pruneBills(data, T - DAY).bills)).toEqual(['B2']);
  expect(pruneBills(data, T - 10 * DAY)).toBe(data);
});

it('customers and delivery orders from the server are merged too, also into data saved before they existed', () => {
  const { customers, orders, ...old } = emptyData();
  const changes = {
    ...NONE,
    customers: [{ id: 'C1', name: 'Ravi', createdAt: T }, { id: 'C2', name: 'Sita', createdAt: T + 1 }],
    orders: [{ id: 'O1', status: 'new', at: T }, { id: 'O2', status: 'new', at: T + DAY }],
  };

  const merged = mergeChanges(old, changes);

  expect(ids(merged.customers)).toEqual(['C2', 'C1']);
  expect(ids(merged.orders)).toEqual(['O2', 'O1']);
  expect(ids(mergeChanges(merged, { ...NONE, customers: [{ id: 'C1', deleted: true }] }).customers)).toEqual(['C2']);
});
