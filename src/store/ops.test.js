import { it, expect } from 'vitest';
import { applyOp, emptyData, emptyDataset } from './ops.js';

const T = Date.UTC(2026, 10, 16, 6);

const product = (fields) => ({
  id: 'P1', code: 'ML', barcode: '8901262010016', name: 'Milk 500ml', names: {}, aliases: [], category: 'dairy',
  price: 30, min: 20, coverDays: 2, quantity: 40, needsReview: false, createdAt: T, ...fields,
});
const shop = () => ({
  ...emptyData(),
  products: [product(), product({ id: 'P2', code: 'BR', barcode: '', name: 'Bread', price: 40, quantity: 8 })],
});
const bill = (id, lines, at = T) => {
  const items = lines.map(([productId, qty, price = 30]) => ({ productId, name: productId, qty, price, total: qty * price }));
  return { id, billNo: id.slice(1), at, total: items.reduce((sum, i) => sum + i.total, 0), payment: { method: 'cash' }, items };
};
const sale = (id, lines, at) => ({ id: `op-${id}`, type: 'sale', at: at ?? T, bill: bill(id, lines, at) });
const stock = (data, id) => data.products.find((p) => p.id === id)?.quantity;

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

it('starts empty', () => {
  expect(emptyData()).toEqual({ products: [], bills: [], purchaseOrders: [], invoices: [], shop: { name: '' } });
  expect(emptyDataset()).toEqual({ data: emptyData(), outbox: [], cursor: 0, counters: { bill: 1, po: 1, sku: 1 }, device: { id: null, no: 0 } });
});

it('a sale reduces each product and puts the bill first', () => {
  const before = applyOp(shop(), sale('B1', [['P1', 1]], T - 1000));

  const after = applyOp(before, sale('B2', [['P1', 2], ['P2', 3, 40], ['P1', 1]]));

  expect(stock(after, 'P1')).toBe(36);
  expect(stock(after, 'P2')).toBe(5);
  expect(after.bills.map((b) => b.id)).toEqual(['B2', 'B1']);
  expect(after.bills[0].total).toBe(210);
});

it('an older bill is placed by its time, not first', () => {
  const data = [sale('B2', [['P1', 1]], T), sale('B1', [['P1', 1]], T - 5000), sale('B3', [['P1', 1]], T + 5000)].reduce(applyOp, shop());

  expect(data.bills.map((b) => b.id)).toEqual(['B3', 'B2', 'B1']);
});

it('applying the same sale twice changes nothing the second time', () => {
  const once = applyOp(shop(), sale('B1', [['P1', 2]]));

  const twice = applyOp(once, sale('B1', [['P1', 2]]));

  expect(twice).toBe(once);
  expect(stock(twice, 'P1')).toBe(38);
});

it('a sale of a product that is no longer listed still records the bill', () => {
  const after = applyOp(shop(), sale('B1', [['GONE', 2]]));

  expect(after.bills).toHaveLength(1);
  expect(after.products).toEqual(shop().products);
});

it('stock.move with an unknown product is ignored', () => {
  const data = shop();

  expect(applyOp(data, { id: 'op-1', type: 'stock.move', at: T, reason: 'manual', lines: [{ productId: 'NOPE', delta: 5 }] })).toBe(data);
});

it('stock.move adds to stock and records the invoice once', () => {
  const invoice = { id: 'INV1', supplier: 'ABC', invoiceNo: 'INV-1', dateText: '16/11/2026', units: 60, count: 2, at: T };
  const move = { id: 'op-1', type: 'stock.move', at: T, reason: 'invoice', lines: [{ productId: 'P1', delta: 50 }, { productId: 'P2', delta: 10 }], invoice };

  const after = applyOp(shop(), move);

  expect(stock(after, 'P1')).toBe(90);
  expect(stock(after, 'P2')).toBe(18);
  expect(after.invoices).toEqual([invoice]);
  expect(applyOp(after, { ...move, id: 'op-2', lines: [{ productId: 'NOPE', delta: 1 }] }).invoices).toHaveLength(1);
});

it('product.create adds a product with defaults; an id that exists is kept', () => {
  const data = shop();

  const added = applyOp(data, { id: 'op-1', type: 'product.create', at: T + 5, product: { id: 'P3', name: 'Soap', quantity: 12 } });
  const same = applyOp(added, { id: 'op-2', type: 'product.create', at: T, product: { id: 'P1', name: 'Other', quantity: 999 } });

  expect(added.products[2]).toEqual({
    id: 'P3', code: '', barcode: '', name: 'Soap', names: {}, aliases: [], category: 'other', price: 0, min: 0, coverDays: 7, quantity: 12, needsReview: false, createdAt: T + 5, batch: '', mfgDate: '', expiryDate: '',
  });
  expect(same).toBe(added);
});

it('product.update changes only the patch fields', () => {
  const data = shop();

  const after = applyOp(data, { id: 'op-1', type: 'product.update', at: T, productId: 'P1', patch: { price: 32, min: 25, needsReview: true, quantity: 7, id: 'HACK' } });

  expect(after.products[0]).toEqual(product({ price: 32, min: 25, needsReview: true }));
  expect(after.products[1]).toBe(data.products[1]);
  expect(applyOp(after, { id: 'op-2', type: 'product.update', at: T, productId: 'NOPE', patch: { price: 1 } })).toBe(after);
});

it('product.delete removes the product', () => {
  const after = applyOp(shop(), { id: 'op-1', type: 'product.delete', at: T, productId: 'P1' });

  expect(after.products.map((p) => p.id)).toEqual(['P2']);
  expect(applyOp(after, { id: 'op-2', type: 'product.delete', at: T, productId: 'P1' })).toBe(after);
});

const po = (fields) => ({ id: 'PO101', poNo: '101', supplier: 'ABC', status: 'draft', items: [{ productId: 'P1', qty: 50 }], createdAt: T, ...fields });
const create = (fields) => ({ id: `op-c-${fields?.id ?? 'PO101'}`, type: 'po.create', at: T, po: po(fields) });
const receive = { id: 'op-r', type: 'po.receive', at: T + 9, poId: 'PO101', lines: [{ productId: 'P1', delta: 50 }], changes: [{ productId: 'P1', before: 40, after: 90, qty: 50 }] };

it('po.create puts the newest order first and keeps an existing id', () => {
  const data = [create(), create({ id: 'PO102', poNo: '102', createdAt: T + 1 })].reduce(applyOp, shop());

  expect(data.purchaseOrders.map((o) => o.id)).toEqual(['PO102', 'PO101']);
  expect(applyOp(data, create({ supplier: 'Changed' }))).toBe(data);
});

it('po.receive adds stock once', () => {
  const created = applyOp(shop(), create());

  const received = applyOp(created, receive);
  const again = applyOp(received, { ...receive, id: 'op-r2' });

  expect(stock(received, 'P1')).toBe(90);
  expect(received.purchaseOrders[0]).toEqual(po({ status: 'received', receivedAt: T + 9, changes: receive.changes }));
  expect(again).toBe(received);
});

it('po.update edits an open order and is ignored after it is received', () => {
  const update = (patch) => ({ id: 'op-u', type: 'po.update', at: T, poId: 'PO101', patch });
  const created = applyOp(shop(), create());

  const edited = applyOp(created, update({ supplier: 'New', status: 'sent', items: [{ productId: 'P1', qty: 60 }], id: 'HACK' }));
  const late = applyOp(applyOp(edited, receive), update({ supplier: 'Too late' }));

  expect(edited.purchaseOrders[0]).toEqual(po({ supplier: 'New', status: 'sent', items: [{ productId: 'P1', qty: 60 }] }));
  expect(late.purchaseOrders[0].supplier).toBe('New');
});

it('po.delete only removes drafts', () => {
  const del = (poId) => ({ id: `op-d-${poId}`, type: 'po.delete', at: T, poId });
  const data = [create(), create({ id: 'PO102', poNo: '102', status: 'sent' })].reduce(applyOp, shop());

  const after = [del('PO101'), del('PO102')].reduce(applyOp, data);

  expect(after.purchaseOrders.map((o) => o.id)).toEqual(['PO102']);
});

it('import skips ids that already exist', () => {
  const data = applyOp(shop(), sale('B1', [['P1', 1]]));
  const stockBefore = stock(data, 'P1');

  const after = applyOp(data, {
    id: 'op-i', type: 'import', at: T,
    products: [{ id: 'P1', name: 'Overwritten?', quantity: 1 }, { id: 'P3', name: 'Soap', quantity: 5 }],
    bills: [bill('B1', [['P1', 9]]), bill('B0', [['P1', 4]], T - 1000)],
    purchaseOrders: [po()],
    invoices: [{ id: 'INV1', supplier: 'ABC', invoiceNo: '1', dateText: '', units: 5, count: 1, at: T }],
  });

  expect(after.products.map((p) => [p.id, p.name])).toEqual([['P1', 'Milk 500ml'], ['P2', 'Bread'], ['P3', 'Soap']]);
  expect(after.bills.map((b) => b.id)).toEqual(['B1', 'B0']);
  expect(stock(after, 'P1')).toBe(stockBefore);
  expect(after.purchaseOrders).toHaveLength(1);
  expect(after.invoices).toHaveLength(1);
});

it('shop.update renames the shop', () => {
  expect(applyOp(shop(), { id: 'op-1', type: 'shop.update', at: T, name: 'Lakshmi Kirana' }).shop).toEqual({ name: 'Lakshmi Kirana' });
});

it('an unknown change is ignored', () => {
  const data = shop();

  expect(applyOp(data, { id: 'op-1', type: 'loyalty.award', at: T })).toBe(data);
});

it('never changes the data it was given', () => {
  const data = deepFreeze([create(), sale('B1', [['P1', 1]])].reduce(applyOp, shop()));
  const ops = [
    sale('B2', [['P1', 2]]),
    { id: 'o1', type: 'stock.move', at: T, reason: '', lines: [{ productId: 'P1', delta: 5 }] },
    { id: 'o2', type: 'product.create', at: T, product: { id: 'P9', name: 'New' } },
    { id: 'o3', type: 'product.update', at: T, productId: 'P1', patch: { price: 1 } },
    { id: 'o4', type: 'product.delete', at: T, productId: 'P2' },
    { id: 'o5', type: 'po.update', at: T, poId: 'PO101', patch: { supplier: 'X' } },
    receive,
    { id: 'o6', type: 'shop.update', at: T, name: 'X' },
    { id: 'o7', type: 'import', at: T, products: [{ id: 'P8', name: 'Y' }] },
  ];

  expect(() => ops.reduce(applyOp, data)).not.toThrow();
});
