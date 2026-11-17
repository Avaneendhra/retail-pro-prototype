import test from 'node:test';
import assert from 'node:assert/strict';
import { signup, login, sync, shopWithMilk, createProductOp, saleOp, opId, T0, DAY } from './helpers.js';

const MILK = {
  id: 'P1', code: 'ML', barcode: '8901262010016', name: 'Milk 500ml', names: {}, aliases: [], category: 'dairy',
  price: 30, min: 20, coverDays: 2, quantity: 40, needsReview: false, createdAt: T0, batch: '', mfgDate: '', expiryDate: '',
};
const NOTHING = { products: [], bills: [], purchaseOrders: [], invoices: [] };
const secondDevice = (app, deviceId = 'device-b') => login(app, { login: 'lakshmi@example.com', deviceId });
const ids = (rows) => rows.map((r) => r.id);

test('the first sync returns every product and the cursor', async () => {
  const { app, owner } = await shopWithMilk();

  const res = await sync(app, owner.token);

  assert.equal(res.status, 200);
  assert.deepEqual(res.changes, { ...NOTHING, products: [MILK] });
  assert.equal(res.cursor, 1);
  assert.equal(res.more, false);
  assert.deepEqual(res.shop, { id: owner.shop.id, name: 'Sri Lakshmi Stores' });
  assert.deepEqual(res.user, owner.user);
  assert.deepEqual(res.device, { id: 'device-a', no: 1, counters: {} });
  assert.deepEqual(res.accepted, []);
  assert.deepEqual(res.rejected, []);
});

test('a second sync with that cursor returns nothing', async () => {
  const { app, owner } = await shopWithMilk();
  const first = await sync(app, owner.token);

  const second = await sync(app, owner.token, { since: first.cursor });

  assert.deepEqual(second.changes, NOTHING);
  assert.equal(second.cursor, first.cursor);
  assert.equal(second.more, false);
});

test("another device's sale comes back as one bill and the changed products only", async () => {
  const { app, owner } = await shopWithMilk();
  await sync(app, owner.token, { ops: [createProductOp({ id: 'P2', name: 'Bread', code: 'BR', barcode: '', quantity: 8 })] });
  const { cursor } = await sync(app, owner.token);
  const second = await secondDevice(app);
  const sale = saleOp([['P1', 2]], { billId: 'BB1001' });

  await sync(app, second.token, { deviceId: 'device-b', ops: [sale] });
  const res = await sync(app, owner.token, { since: cursor });

  assert.deepEqual(res.changes.bills, [{
    id: 'BB1001', billNo: sale.bill.billNo, at: T0, total: 60, payment: { method: 'cash' }, items: sale.bill.items, deviceNo: 2, userId: owner.user.id,
  }]);
  assert.deepEqual(res.changes.products, [{ ...MILK, quantity: 38 }]);
  assert.equal(res.cursor, cursor + 1);
});

test('a push returns its own effects in the same response', async () => {
  const { app, owner } = await shopWithMilk();
  const { cursor } = await sync(app, owner.token);
  const sale = saleOp([['P1', 5]]);

  const res = await sync(app, owner.token, { since: cursor, ops: [sale] });

  assert.deepEqual(res.accepted, [sale.id]);
  assert.deepEqual(ids(res.changes.bills), [sale.bill.id]);
  assert.equal(res.changes.products[0].quantity, 35);
  assert.equal(res.cursor, cursor + 1);
});

test('a deleted product is reported once to devices that knew it and never to a new device', async () => {
  const { app, owner } = await shopWithMilk();
  const second = await secondDevice(app);
  const known = await sync(app, second.token, { deviceId: 'device-b' });

  await sync(app, owner.token, { ops: [{ id: opId(), type: 'product.delete', at: T0, productId: 'P1' }] });
  const told = await sync(app, second.token, { deviceId: 'device-b', since: known.cursor });
  const toldAgain = await sync(app, second.token, { deviceId: 'device-b', since: told.cursor });
  const third = await secondDevice(app, 'device-c');
  const fresh = await sync(app, third.token, { deviceId: 'device-c' });

  assert.deepEqual(told.changes.products, [{ id: 'P1', deleted: true }]);
  assert.deepEqual(toldAgain.changes.products, []);
  assert.deepEqual(fresh.changes.products, []);
});

test('orders come back with their items, and a deleted draft is reported as deleted', async () => {
  const { app, owner } = await shopWithMilk();
  const po = { id: 'POA101', poNo: 'A101', supplier: 'ABC', status: 'draft', items: [{ productId: 'P1', qty: 50 }], createdAt: T0 };
  const changes = [{ productId: 'P1', before: 40, after: 90, qty: 50 }];

  const created = await sync(app, owner.token, { ops: [{ id: opId(), type: 'po.create', at: T0, po }, { id: opId(), type: 'po.create', at: T0, po: { ...po, id: 'POA102', poNo: 'A102' } }] });
  const after = await sync(app, owner.token, {
    since: created.cursor,
    ops: [
      { id: opId(), type: 'po.receive', at: T0 + 5, poId: 'POA101', lines: [{ productId: 'P1', delta: 50 }], changes },
      { id: opId(), type: 'po.delete', at: T0, poId: 'POA102' },
    ],
  });

  assert.deepEqual(created.changes.purchaseOrders[0], po);
  assert.deepEqual(after.changes.purchaseOrders, [
    { ...po, status: 'received', receivedAt: T0 + 5, changes },
    { id: 'POA102', deleted: true },
  ]);
});

test('supplier invoices come back as they were recorded', async () => {
  const { app, owner } = await shopWithMilk();
  const invoice = { id: 'INV-A1', supplier: 'ABC Distributors', invoiceNo: 'INV-1025', dateText: '16/11/2026', units: 50, count: 1, at: T0 };

  await sync(app, owner.token, { ops: [{ id: opId(), type: 'stock.move', at: T0, reason: 'invoice', lines: [{ productId: 'P1', delta: 50 }], invoice }] });
  const res = await sync(app, owner.token);

  assert.deepEqual(res.changes.invoices, [invoice]);
});

test('bills older than billsSince are not returned', async () => {
  const { app, owner } = await shopWithMilk();
  const old = saleOp([['P1', 1]], { at: T0 - 90 * DAY });
  const recent = saleOp([['P1', 1]], { at: T0 - 59 * DAY });
  await sync(app, owner.token, { ops: [old, recent] });

  const res = await sync(app, owner.token, { billsSince: T0 - 60 * DAY });

  assert.deepEqual(ids(res.changes.bills), [recent.bill.id]);
});

test('a bill dated in the future is still returned', async () => {
  const { app, owner } = await shopWithMilk();
  const future = saleOp([['P1', 1]], { at: T0 + 3 * DAY });
  await sync(app, owner.token, { ops: [future] });

  const res = await sync(app, owner.token, { billsSince: T0 - 60 * DAY });

  assert.deepEqual(ids(res.changes.bills), [future.bill.id]);
  assert.equal(res.changes.bills[0].at, T0 + 3 * DAY);
});

test('1,200 imported bills arrive over several pages with none lost or repeated', async () => {
  const { app, owner } = await shopWithMilk();
  const bill = (n) => ({ id: `B${n}`, billNo: String(n), at: T0 - n * 1000, total: 30, payment: { method: 'cash' }, items: [{ productId: 'P1', name: 'Milk 500ml', qty: 1, price: 30, total: 30 }], seed: true });
  const imports = Array.from({ length: 12 }, (_, page) => ({
    id: opId(), type: 'import', at: T0, bills: Array.from({ length: 100 }, (_, i) => bill(page * 100 + i)),
  }));
  const pushed = await sync(app, owner.token, { ops: imports });
  const fresh = await secondDevice(app, 'device-c');

  const seen = [];
  const pages = [];
  let since = 0;
  let more = true;
  while (more && pages.length < 10) {
    const res = await sync(app, fresh.token, { deviceId: 'device-c', since });
    assert.ok(res.cursor > since, 'every page moves the cursor forward');
    pages.push(res.changes.bills.length);
    seen.push(...ids(res.changes.bills));
    ({ cursor: since, more } = res);
  }

  assert.deepEqual(pushed.rejected, []);
  assert.deepEqual(pages, [500, 500, 200]);
  assert.equal(new Set(seen).size, 1200, 'no bill is missing or repeated');
  assert.equal(seen.length, 1200);
});

test('rows of another shop are never returned', async () => {
  const { app, owner } = await shopWithMilk();
  const other = await signup(app, { login: 'other@example.com', shopName: 'Other Shop', deviceId: 'device-z' });
  await sync(app, other.token, { deviceId: 'device-z', ops: [createProductOp({ id: 'P9', name: 'Their soap' }), saleOp([['P9', 1]])] });
  await sync(app, owner.token, { ops: [saleOp([['P1', 1]], { billId: 'BA1' })] });

  const mine = await sync(app, owner.token);
  const theirs = await sync(app, other.token, { deviceId: 'device-z' });

  assert.deepEqual(ids(mine.changes.products), ['P1']);
  assert.deepEqual(ids(mine.changes.bills), ['BA1']);
  assert.deepEqual(ids(theirs.changes.products), ['P9']);
  assert.equal(theirs.changes.bills.length, 1);
  assert.equal(theirs.shop.name, 'Other Shop');
});

test('counters sent by a device are returned at its next login, and never go down', async () => {
  const { app, owner } = await shopWithMilk();

  const first = await sync(app, owner.token, { counters: { bill: 1031, po: 104, sku: 1020 } });
  const afterFirst = await login(app, { login: 'lakshmi@example.com', deviceId: 'device-a' });
  await sync(app, owner.token, { counters: { bill: 1000, po: 104, sku: 1025 } });
  const afterSecond = await login(app, { login: 'lakshmi@example.com', deviceId: 'device-a' });

  assert.deepEqual(first.device.counters, { bill: 1031, po: 104, sku: 1020 });
  assert.deepEqual(afterFirst.device.counters, { bill: 1031, po: 104, sku: 1020 });
  assert.deepEqual(afterSecond.device.counters, { bill: 1031, po: 104, sku: 1025 });
});

test('a token older than a day is replaced', async () => {
  const { app, owner, clock } = await shopWithMilk();

  const sameDay = await sync(app, owner.token);
  clock.t += DAY + 1;
  const nextDay = await sync(app, owner.token);

  assert.equal(sameDay.token, undefined);
  assert.match(nextDay.token, /^[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.notEqual(nextDay.token, owner.token);
  assert.equal((await sync(app, nextDay.token)).token, undefined, 'the new token is fresh');
});

test('an idle sync writes nothing', async () => {
  const { app, db, owner } = await shopWithMilk();
  const totalChanges = () => db.raw.prepare('SELECT total_changes() AS n').get().n;
  const { cursor } = await sync(app, owner.token, { counters: { bill: 1031, po: 104, sku: 1020 } });
  const before = totalChanges();

  const res = await sync(app, owner.token, { since: cursor, counters: { bill: 1031, po: 104, sku: 1020 } });

  assert.equal(res.status, 200);
  assert.equal(totalChanges(), before);
});

test('a malformed sync body is refused', async () => {
  const { app, owner } = await shopWithMilk();

  for (const body of [{ since: -1 }, { since: 'x' }, { billsSince: -5 }, { counters: { bill: -1 } }, { deviceId: 'x' }]) {
    const res = await sync(app, owner.token, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.error.code, 'invalid_input');
  }
});

test('a discount on a bill is kept and comes back', async () => {
  const { app, owner } = await shopWithMilk();
  const sale = saleOp([['P1', 2]], { billId: 'BA9' });
  sale.bill = { ...sale.bill, total: 50, discount: 10 };

  await sync(app, owner.token, { ops: [sale, saleOp([['P1', 1]], { billId: 'BA10' })] });
  const res = await sync(app, owner.token);

  const byId = Object.fromEntries(res.changes.bills.map((b) => [b.id, b]));
  assert.equal(byId.BA9.discount, 10);
  assert.equal(byId.BA9.total, 50);
  assert.equal('discount' in byId.BA10, false);
});

test('a product keeps its batch, manufacturing and expiry dates, and they can be updated', async () => {
  const { app, owner } = await shopWithMilk();

  await sync(app, owner.token, { ops: [createProductOp({ id: 'P7', name: 'Amul Butter 100g', batch: 'AB123', mfgDate: '2026-08', expiryDate: '2027-02-14' })] });
  await sync(app, owner.token, { ops: [{ id: opId(), type: 'product.update', at: T0, productId: 'P1', patch: { batch: 'M9', mfgDate: '2026-11-10', expiryDate: '2026-11-13' } }] });
  const bad = await sync(app, owner.token, { ops: [{ id: opId(), type: 'product.update', at: T0, productId: 'P1', patch: { expiryDate: 'next week' } }] });
  const res = await sync(app, owner.token);

  const byId = Object.fromEntries(res.changes.products.map((p) => [p.id, p]));
  assert.deepEqual([byId.P7.batch, byId.P7.mfgDate, byId.P7.expiryDate], ['AB123', '2026-08', '2027-02-14']);
  assert.deepEqual([byId.P1.batch, byId.P1.mfgDate, byId.P1.expiryDate], ['M9', '2026-11-10', '2026-11-13']);
  assert.match(bad.rejected[0].reason, /^invalid/);
});
