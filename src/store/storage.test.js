import { it, expect, vi, afterEach } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { openStorage, memoryStorage } from './storage.js';

const bill = (n) => ({ id: `B${n}`, billNo: String(n), at: n * 1000, total: 30, payment: { method: 'cash' }, items: [{ productId: 'P1', name: 'Milk', qty: 1, price: 30, total: 30 }] });
const dataset = (bills, extra = {}) => ({
  data: { products: [{ id: 'P1', name: 'Milk', quantity: 40 }], bills, purchaseOrders: [], invoices: [], shop: { name: 'Shop' } },
  outbox: [{ id: 'op-1', type: 'shop.update', at: 1, name: 'Shop' }],
  cursor: 7,
  counters: { bill: 1026, po: 101, sku: 1017 },
  device: { id: 'device-a', no: 1 },
  ...extra,
});

afterEach(() => vi.restoreAllMocks());

it('a saved dataset loads back identical', async () => {
  const storage = await openStorage(new IDBFactory());
  const saved = dataset([bill(3), bill(2), bill(1)]);

  await storage.save('local', saved);

  expect(storage.kind).toBe('idb');
  expect(await storage.load('local')).toEqual(saved);
  expect(await storage.load('other')).toBe(null);
});

it('data is still there when the app opens again', async () => {
  const factory = new IDBFactory();
  await (await openStorage(factory)).save('local', dataset([bill(1)]));

  const reopened = await openStorage(factory);

  expect((await reopened.load('local')).data.bills).toEqual([bill(1)]);
});

it('saving again writes only changed bills', async () => {
  const storage = await openStorage(new IDBFactory());
  const first = dataset([bill(3), bill(2), bill(1)]);
  await storage.save('local', first);
  const put = vi.spyOn(IDBObjectStore.prototype, 'put');
  const billPuts = () => put.mock.contexts.filter((store) => store.name === 'bills').length;

  const second = dataset([bill(4), ...first.data.bills.slice(0, 2)]);
  await storage.save('local', second, first.data.bills);

  expect(billPuts()).toBe(1);
  expect((await storage.load('local')).data.bills.map((b) => b.id)).toEqual(['B4', 'B3', 'B2']);
});

it('a save without the previous bills replaces them all', async () => {
  const storage = await openStorage(new IDBFactory());
  await storage.save('local', dataset([bill(3), bill(2), bill(1)]));

  await storage.save('local', dataset([bill(9)]));

  expect((await storage.load('local')).data.bills.map((b) => b.id)).toEqual(['B9']);
});

it('datasets do not mix, and drop removes only one', async () => {
  const storage = await openStorage(new IDBFactory());
  await storage.save('local', dataset([bill(1)]));
  await storage.save('shop:s1', dataset([bill(1), bill(2)].reverse(), { cursor: 99 }));

  await storage.drop('local');

  expect(await storage.load('local')).toBe(null);
  const kept = await storage.load('shop:s1');
  expect(kept.cursor).toBe(99);
  expect(kept.data.bills.map((b) => b.id)).toEqual(['B2', 'B1']);
});

it('falls back to memory and reports when IndexedDB fails', async () => {
  const throws = { open() { throw new Error('denied'); } };
  const errors = { open() { const request = {}; queueMicrotask(() => request.onerror?.({ target: request })); return request; } };
  const hangs = { open() { return {}; } };

  for (const factory of [throws, errors, hangs, null]) {
    const storage = await openStorage(factory, { timeoutMs: 20 });
    expect(storage.kind).toBe('memory');
    await storage.save('local', dataset([bill(1)]));
    expect((await storage.load('local')).cursor).toBe(7);
  }
});

it('memory storage keeps, replaces and drops datasets', async () => {
  const storage = memoryStorage();
  await storage.save('local', dataset([bill(1)]));
  await storage.save('shop:s1', dataset([], { cursor: 3 }));

  await storage.drop('local');

  expect(storage.kind).toBe('memory');
  expect(await storage.load('local')).toBe(null);
  expect((await storage.load('shop:s1')).cursor).toBe(3);
});

it('a failed write rejects instead of pretending it was saved', async () => {
  const storage = await openStorage(new IDBFactory());
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });

  await expect(storage.save('local', dataset([bill(1)]))).rejects.toThrow();
});
