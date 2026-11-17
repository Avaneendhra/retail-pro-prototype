import { it, expect } from 'vitest';
import { readLegacy, clearLegacy } from './legacy.js';

function fakeStorage(entries = {}) {
  const map = new Map(Object.entries(entries).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    keys: () => [...map.keys()],
  };
}

const at = (day, hour) => new Date(2026, 10, day, hour).getTime();

const OLD = {
  sr2_products: [
    { id: 'P1001', code: 'ML', barcode: '8901262010016', name: 'Milk 500ml', names: { te: 'పాలు 500ml' }, aliases: ['milk'], category: 'dairy', price: 30, quantity: 37, min: 20, coverDays: 2, addedAt: at(1, 9) },
    { id: 'P1017', code: 'SOA', barcode: 'P1017', name: 'Soap', category: 'other', price: 25, quantity: 4, min: 5, coverDays: 7, addedAt: at(10, 9), needsReview: true },
  ],
  sr2_sales: [
    { id: 'H2-P1001', billId: null, productId: 'P1001', productName: 'Milk 500ml', qty: 20, price: 30, total: 600, date: at(14, 10) },
    { id: 'H2-P1017', billId: null, productId: 'P1017', productName: 'Soap', qty: 2, price: 25, total: 50, date: at(14, 15) },
    { id: 'H1-P1001', billId: null, productId: 'P1001', productName: 'Milk 500ml', qty: 18, price: 30, total: 540, date: at(15, 11) },
    { id: 'B1025-0', billId: 'B1025', productId: 'P1001', productName: 'Milk 500ml', qty: 3, price: 30, total: 90, date: at(16, 9) },
    { id: 'B0999-0', billId: 'B0999', productId: 'P1001', productName: 'Milk 500ml', qty: 1, price: 30, total: 30, date: at(15, 18) },
  ],
  sr2_bills: [
    { id: 'B1025', billNo: 1025, date: at(16, 9), total: 90, payment: { method: 'cash', received: 100 }, items: [{ productId: 'P1001', name: 'Milk 500ml', names: { te: 'పాలు 500ml' }, code: 'ML', qty: 3, price: 30, total: 90 }], changes: [{ productId: 'P1001', before: 40, after: 37, qty: 3 }] },
  ],
  sr2_purchase_orders: [
    { id: 'PO101', poNo: 101, supplier: 'ABC', status: 'draft', createdAt: at(16, 8), items: [{ productId: 'P1001', qty: 50 }] },
  ],
  sr2_meta: { nextBill: 1026, nextPO: 102, nextSku: 1018 },
  sr2_invoices: [{ supplier: 'ABC', invoiceNo: 'INV-9', date: '15/11/2026', count: 2, units: 60, at: at(15, 12) }],
  sr2_settings: { apiKey: 'secret', shopName: 'Sri Lakshmi Stores' },
};

it('old sr2 keys become a dataset: products kept, bills kept, history lines grouped into one seed bill per day, counters taken from sr2_meta', () => {
  const dataset = readLegacy(fakeStorage(OLD));

  expect(dataset.data.products).toEqual([
    { id: 'P1001', code: 'ML', barcode: '8901262010016', name: 'Milk 500ml', names: { te: 'పాలు 500ml' }, aliases: ['milk'], category: 'dairy', price: 30, quantity: 37, min: 20, coverDays: 2, needsReview: false, createdAt: at(1, 9), batch: '', mfgDate: '', expiryDate: '' },
    { id: 'P1017', code: 'SOA', barcode: 'P1017', name: 'Soap', names: {}, aliases: [], category: 'other', price: 25, quantity: 4, min: 5, coverDays: 7, needsReview: true, createdAt: at(10, 9), batch: '', mfgDate: '', expiryDate: '' },
  ]);
  expect(dataset.data.bills.map((b) => [b.id, b.billNo, b.at, b.total, Boolean(b.seed)])).toEqual([
    ['B1025', '1025', at(16, 9), 90, false],
    ['H20261115', 'H20261115', at(15, 18), 570, true],
    ['H20261114', 'H20261114', at(14, 15), 650, true],
  ]);
  expect(dataset.data.bills[0]).toEqual({
    id: 'B1025', billNo: '1025', at: at(16, 9), total: 90, payment: { method: 'cash', received: 100 },
    items: [{ productId: 'P1001', name: 'Milk 500ml', names: { te: 'పాలు 500ml' }, code: 'ML', qty: 3, price: 30, total: 90 }],
  });
  expect(dataset.data.bills[1].items).toEqual([{ productId: 'P1001', name: 'Milk 500ml', qty: 19, price: 30, total: 570 }]);
  expect(dataset.data.purchaseOrders).toEqual([{ id: 'PO101', poNo: '101', supplier: 'ABC', status: 'draft', createdAt: at(16, 8), items: [{ productId: 'P1001', qty: 50 }] }]);
  expect(dataset.data.invoices).toEqual([{ id: `INVL${at(15, 12)}`, supplier: 'ABC', invoiceNo: 'INV-9', dateText: '15/11/2026', units: 60, count: 2, at: at(15, 12) }]);
  expect(dataset.data.shop).toEqual({ name: 'Sri Lakshmi Stores' });
  expect(dataset.counters).toEqual({ bill: 1026, po: 102, sku: 1018 });
  expect(dataset.outbox).toEqual([]);
  expect(dataset.cursor).toBe(0);
  expect(dataset.device).toEqual({ id: null, no: 0 });
});

it('old sample barcodes with a wrong last digit are corrected', () => {
  const dataset = readLegacy(fakeStorage({ sr2_products: [{ ...OLD.sr2_products[0], barcode: '8901262010011' }] }));

  expect(dataset.data.products[0].barcode).toBe('8901262010016');
});

it('works out the next numbers when sr2_meta is missing', () => {
  const { sr2_meta, ...withoutMeta } = OLD;

  expect(readLegacy(fakeStorage(withoutMeta)).counters).toEqual({ bill: 1026, po: 102, sku: 1018 });
});

it('returns null when there is nothing to migrate', () => {
  expect(readLegacy(fakeStorage({ sr_lang: 'te' }))).toBe(null);
  expect(readLegacy(fakeStorage({ sr2_products: '{not json' }))).toBe(null);
  expect(readLegacy(null)).toBe(null);
});

it('clearLegacy removes the old data and leaves settings and language', () => {
  const storage = fakeStorage({ ...OLD, sr_lang: 'te' });

  clearLegacy(storage);

  expect(storage.keys().sort()).toEqual(['sr2_settings', 'sr_lang']);
});
