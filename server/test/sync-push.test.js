import test from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, call, signup, login, sync, stockOf, shopWithMilk, createProductOp, saleOp, opId, keyFor, T0 } from './helpers.js';

const one = async (db, sql, args) => (await db.query(sql, args))[0];

/** Adds a staff login to the owner's shop directly in the database and logs them in on device-b. */
async function addStaff(app, db, owner) {
  const authKey = await keyFor('ravi@example.com', 'staff password');
  const { hashAuthKey } = await import('../src/auth.js');
  const { salt, hash } = await hashAuthKey(authKey);
  await db.batch([{
    sql: "INSERT INTO users (id, shop_id, login, name, role, pass_salt, pass_hash, created_at) VALUES ('u_staff', ?, 'ravi@example.com', 'Ravi', 'staff', ?, ?, ?)",
    args: [owner.shop.id, salt, hash, T0],
  }]);
  return login(app, { login: 'ravi@example.com', password: 'staff password', deviceId: 'device-b' });
}

test('a sale reduces stock and stores the bill', async () => {
  const { app, db, owner } = await shopWithMilk();
  const op = saleOp([['P1', 2]], { billId: 'BA1001' });

  const res = await sync(app, owner.token, { ops: [op] });

  assert.equal(res.status, 200);
  assert.deepEqual(res.accepted, [op.id]);
  assert.deepEqual(res.rejected, []);
  assert.equal(await stockOf(db, 'P1'), 38);
  const bill = await one(db, 'SELECT bill_no, total, items, device_no, user_id FROM bills WHERE id = ?', ['BA1001']);
  assert.equal(bill.total, 60);
  assert.equal(bill.device_no, 1);
  assert.equal(bill.user_id, owner.user.id);
  assert.equal(JSON.parse(bill.items)[0].qty, 2);
});

test('sending the same sale twice reduces stock once', async () => {
  const { app, db, owner } = await shopWithMilk();
  const op = saleOp([['P1', 2]]);

  await sync(app, owner.token, { ops: [op] });
  const again = await sync(app, owner.token, { ops: [op] });

  assert.deepEqual(again.accepted, [op.id], 'a repeat is still acknowledged');
  assert.equal(await stockOf(db, 'P1'), 38);
  assert.equal((await one(db, 'SELECT COUNT(*) AS n FROM bills')).n, 1);
});

test('the same sale twice in one request reduces stock once', async () => {
  const { app, db, owner } = await shopWithMilk();
  const op = saleOp([['P1', 2]]);

  await sync(app, owner.token, { ops: [op, op] });

  assert.equal(await stockOf(db, 'P1'), 38);
});

test('sales from two devices both count', async () => {
  const { app, db, owner } = await shopWithMilk();
  const second = await login(app, { login: 'lakshmi@example.com', deviceId: 'device-b' });

  await sync(app, owner.token, { deviceId: 'device-a', ops: [saleOp([['P1', 2]])] });
  await sync(app, second.token, { deviceId: 'device-b', ops: [saleOp([['P1', 3]])] });

  assert.equal(await stockOf(db, 'P1'), 35);
  assert.deepEqual((await db.query('SELECT device_no FROM bills ORDER BY device_no')).map(r => r.device_no), [1, 2]);
});

test('one sale with the same product on two lines subtracts both', async () => {
  const { app, db, owner } = await shopWithMilk();

  await sync(app, owner.token, { ops: [saleOp([['P1', 2], ['P1', 3]])] });

  assert.equal(await stockOf(db, 'P1'), 35);
});

test('stock can go below zero', async () => {
  const { app, db, owner } = await shopWithMilk();

  await sync(app, owner.token, { ops: [saleOp([['P1', 41]])] });

  assert.equal(await stockOf(db, 'P1'), -1);
});

test('stock.move adds stock and records the invoice', async () => {
  const { app, db, owner } = await shopWithMilk();
  const op = {
    id: opId(), type: 'stock.move', at: T0, reason: 'invoice', lines: [{ productId: 'P1', delta: 50 }],
    invoice: { id: 'INV-A1', supplier: 'ABC Distributors', invoiceNo: 'INV-1025', dateText: '16/11/2026', units: 50, count: 1, at: T0 },
  };

  const res = await sync(app, owner.token, { ops: [op] });

  assert.deepEqual(res.rejected, []);
  assert.equal(await stockOf(db, 'P1'), 90);
  const invoice = await one(db, 'SELECT supplier, invoice_no, units, line_count FROM invoices');
  assert.deepEqual({ ...invoice }, { supplier: 'ABC Distributors', invoice_no: 'INV-1025', units: 50, line_count: 1 });
});

test('product.create adds a product; creating the same id again keeps the first', async () => {
  const { app, db, owner } = await shopWithMilk();

  await sync(app, owner.token, { ops: [createProductOp({ id: 'P1', name: 'Something else', quantity: 999 })] });
  await sync(app, owner.token, { ops: [createProductOp({ id: 'P2', name: 'Bread', names: { te: 'బ్రెడ్' }, aliases: ['pav'], code: 'BR', quantity: 8, min: 10 })] });

  assert.equal((await one(db, "SELECT name FROM products WHERE id = 'P1'")).name, 'Milk 500ml');
  assert.equal(await stockOf(db, 'P1'), 40);
  const bread = await one(db, "SELECT name, names, aliases, code, quantity, min_qty FROM products WHERE id = 'P2'");
  assert.deepEqual({ ...bread }, { name: 'Bread', names: '{"te":"బ్రెడ్"}', aliases: '["pav"]', code: 'BR', quantity: 8, min_qty: 10 });
});

test('product.update changes only the listed fields', async () => {
  const { app, db, owner } = await shopWithMilk();

  await sync(app, owner.token, { ops: [{ id: opId(), type: 'product.update', at: T0, productId: 'P1', patch: { price: 32, min: 25, needsReview: true, quantity: 7, shop_id: 'hack' } }] });

  const row = await one(db, "SELECT name, price, min_qty, needs_review, quantity, shop_id FROM products WHERE id = 'P1'");
  assert.deepEqual({ ...row }, { name: 'Milk 500ml', price: 32, min_qty: 25, needs_review: 1, quantity: 40, shop_id: owner.shop.id });
});

test('product.delete hides the product; staff can only remove products they added', async () => {
  const { app, db, owner } = await shopWithMilk();
  const staff = await addStaff(app, db, owner);
  const del = (productId) => ({ id: opId(), type: 'product.delete', at: T0, productId });
  const deleted = async (id) => (await one(db, 'SELECT deleted FROM products WHERE id = ?', [id])).deleted;

  await sync(app, staff.token, { deviceId: 'device-b', ops: [createProductOp({ id: 'PB1', name: 'Wrong scan', code: '', barcode: '' }), del('P1'), del('PB1')] });
  const ownersProductAfterStaff = await deleted('P1');
  const staffsProductAfterStaff = await deleted('PB1');
  await sync(app, owner.token, { ops: [del('P1')] });

  assert.equal(ownersProductAfterStaff, 0, 'staff cannot remove a product someone else added');
  assert.equal(staffsProductAfterStaff, 1, 'staff can undo their own add');
  assert.equal(await deleted('P1'), 1, 'the owner can remove any product');
});

const poCreate = (extra = {}) => ({ id: opId(), type: 'po.create', at: T0, po: { id: 'POA101', poNo: 'A101', supplier: 'ABC', status: 'draft', items: [{ productId: 'P1', qty: 50 }], createdAt: T0, ...extra } });
const poReceive = () => ({ id: opId(), type: 'po.receive', at: T0, poId: 'POA101', lines: [{ productId: 'P1', delta: 50 }], changes: [{ productId: 'P1', before: 40, after: 90, qty: 50 }] });

test('po.receive adds stock once even when two devices receive the same order', async () => {
  const { app, db, owner } = await shopWithMilk();
  const second = await login(app, { login: 'lakshmi@example.com', deviceId: 'device-b' });
  await sync(app, owner.token, { ops: [poCreate()] });

  await sync(app, owner.token, { deviceId: 'device-a', ops: [poReceive()] });
  await sync(app, second.token, { deviceId: 'device-b', ops: [poReceive()] });

  assert.equal(await stockOf(db, 'P1'), 90);
  const po = await one(db, 'SELECT status, received_at, changes FROM purchase_orders');
  assert.equal(po.status, 'received');
  assert.equal(po.received_at, T0);
  assert.equal(JSON.parse(po.changes)[0].after, 90);
});

test('po.update edits a draft and is ignored after the order is received', async () => {
  const { app, db, owner } = await shopWithMilk();
  const update = (patch) => ({ id: opId(), type: 'po.update', at: T0, poId: 'POA101', patch });
  await sync(app, owner.token, { ops: [poCreate()] });

  await sync(app, owner.token, { ops: [update({ supplier: 'New Supplier', status: 'sent', items: [{ productId: 'P1', qty: 60 }] })] });
  const edited = await one(db, 'SELECT supplier, status, items FROM purchase_orders');
  await sync(app, owner.token, { ops: [poReceive(), update({ supplier: 'Too late' })] });

  assert.deepEqual({ ...edited }, { supplier: 'New Supplier', status: 'sent', items: '[{"productId":"P1","qty":60}]' });
  assert.equal((await one(db, 'SELECT supplier FROM purchase_orders')).supplier, 'New Supplier');
});

test('po.delete only removes drafts', async () => {
  const { app, db, owner } = await shopWithMilk();
  const del = (poId) => ({ id: opId(), type: 'po.delete', at: T0, poId });
  await sync(app, owner.token, { ops: [poCreate(), poCreate({ id: 'POA102', poNo: 'A102', status: 'sent' })] });

  await sync(app, owner.token, { ops: [del('POA101'), del('POA102')] });

  const rows = await db.query('SELECT id, deleted FROM purchase_orders ORDER BY id');
  assert.deepEqual(rows.map(r => ({ ...r })), [{ id: 'POA101', deleted: 1 }, { id: 'POA102', deleted: 0 }]);
});

test('import adds rows and leaves existing ones alone', async () => {
  const { app, db, owner } = await shopWithMilk();
  const op = {
    id: opId(), type: 'import', at: T0,
    products: [{ id: 'P1', name: 'Overwritten?', quantity: 1 }, { id: 'P2', name: 'Bread', names: { hi: 'ब्रेड' }, quantity: 8, min: 10, price: 40 }],
    bills: [{ id: 'B1025', billNo: '1025', at: T0 - 1000, total: 40, payment: { method: 'upi' }, items: [{ productId: 'P2', name: 'Bread', qty: 1, price: 40, total: 40 }], seed: true }],
    purchaseOrders: [{ id: 'PO101', poNo: '101', supplier: '', status: 'received', items: [{ productId: 'P2', qty: 20 }], createdAt: T0, receivedAt: T0 }],
    invoices: [{ id: 'INV1', supplier: 'ABC', invoiceNo: 'INV-1', dateText: '', units: 20, count: 1, at: T0 }],
  };

  const res = await sync(app, owner.token, { ops: [op] });

  assert.deepEqual(res.rejected, []);
  assert.equal((await one(db, "SELECT name FROM products WHERE id = 'P1'")).name, 'Milk 500ml');
  assert.equal(await stockOf(db, 'P2'), 8, 'imported bills do not change stock');
  assert.deepEqual({ ...(await one(db, "SELECT names, min_qty FROM products WHERE id = 'P2'")) }, { names: '{"hi":"ब्रेड"}', min_qty: 10 });
  assert.deepEqual({ ...(await one(db, 'SELECT bill_no, seed, payment FROM bills')) }, { bill_no: '1025', seed: 1, payment: '{"method":"upi"}' });
  assert.equal((await one(db, 'SELECT status FROM purchase_orders')).status, 'received');
  assert.equal((await one(db, 'SELECT units FROM invoices')).units, 20);
});

test('an import of more than 100 rows is rejected whole; staff cannot import at all', async () => {
  const { app, db, owner } = await shopWithMilk();
  const staff = await addStaff(app, db, owner);
  const products = (n, prefix) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `Item ${i}` }));

  const tooBig = await sync(app, owner.token, { ops: [{ id: opId(), type: 'import', at: T0, products: products(101, 'X') }] });
  const justRight = await sync(app, owner.token, { ops: [{ id: opId(), type: 'import', at: T0, products: products(100, 'Y') }] });
  const byStaff = await sync(app, staff.token, { deviceId: 'device-b', ops: [{ id: opId(), type: 'import', at: T0, products: products(1, 'Z') }] });

  assert.match(tooBig.rejected[0].reason, /^invalid/);
  assert.deepEqual(justRight.rejected, []);
  assert.equal(byStaff.rejected[0].reason, 'forbidden');
  assert.equal((await one(db, 'SELECT COUNT(*) AS n FROM products')).n, 101, 'Milk plus the 100 accepted rows');
});

test('shop.update renames the shop; staff cannot', async () => {
  const { app, db, owner } = await shopWithMilk();
  const staff = await addStaff(app, db, owner);
  const rename = (name) => ({ id: opId(), type: 'shop.update', at: T0, name });

  const byStaff = await sync(app, staff.token, { deviceId: 'device-b', ops: [rename('Hacked')] });
  await sync(app, owner.token, { ops: [rename('Lakshmi Kirana')] });

  assert.equal(byStaff.rejected[0].reason, 'forbidden');
  assert.equal((await one(db, 'SELECT name FROM shops')).name, 'Lakshmi Kirana');
});

test('rejects an unknown op but applies the others', async () => {
  const { app, db, owner } = await shopWithMilk();
  const sale = saleOp([['P1', 1]]);

  const res = await sync(app, owner.token, {
    ops: [{ id: 'op-future', type: 'loyalty.award', at: T0, points: 5 }, sale, { id: 'op-broken', type: 'sale', at: T0, bill: { id: 'B', items: [] } }, { nonsense: true }],
  });

  assert.deepEqual(res.accepted, [sale.id]);
  assert.equal(res.rejected.length, 3);
  assert.deepEqual(res.rejected[0], { id: 'op-future', reason: 'unknown_type' });
  assert.equal(res.rejected[1].id, 'op-broken');
  assert.match(res.rejected[1].reason, /^invalid/);
  assert.equal(res.rejected[2].id, null);
  assert.equal(await stockOf(db, 'P1'), 39);
});

test('more than 25 ops in one request is refused', async () => {
  const { app, db, owner } = await shopWithMilk();

  const res = await sync(app, owner.token, { ops: Array.from({ length: 26 }, () => saleOp([['P1', 1]])) });

  assert.equal(res.status, 400);
  assert.equal(res.error.code, 'invalid_input');
  assert.equal(await stockOf(db, 'P1'), 40);
});

test('25 ops in one request are all applied, in order', async () => {
  const { app, db, owner } = await shopWithMilk();
  const ops = Array.from({ length: 25 }, () => saleOp([['P1', 1]]));

  const res = await sync(app, owner.token, { ops });

  assert.deepEqual(res.accepted, ops.map(o => o.id));
  assert.equal(await stockOf(db, 'P1'), 15);
});

test('a request without a token is refused', async () => {
  const { app } = await shopWithMilk();

  const res = await call(app, 'POST', '/api/sync', { body: { deviceId: 'device-a', since: 0, ops: [] } });

  assert.equal(res.status, 401);
});

test("one shop cannot change another shop's stock", async () => {
  const { app, db, owner } = await shopWithMilk();
  const other = await signup(app, { login: 'other@example.com', deviceId: 'device-z' });

  await sync(app, other.token, { deviceId: 'device-z', ops: [saleOp([['P1', 5]]), { id: opId(), type: 'product.update', at: T0, productId: 'P1', patch: { price: 1 } }] });

  assert.equal(await stockOf(db, 'P1', owner.shop.id), 40);
  assert.equal((await one(db, 'SELECT price FROM products WHERE shop_id = ?', [owner.shop.id])).price, 30);
});

test('every accepted change is kept in the audit log with who sent it', async () => {
  const { app, db, owner } = await shopWithMilk();
  const op = { id: opId(), type: 'product.update', at: T0 - 5, productId: 'P1', patch: { price: 31 } };

  await sync(app, owner.token, { ops: [op] });

  const row = await one(db, 'SELECT type, payload, at, received_at, user_id, device_id, applied FROM ops WHERE id = ?', [op.id]);
  assert.deepEqual({ ...row, payload: JSON.parse(row.payload) }, {
    type: 'product.update', payload: { productId: 'P1', patch: { price: 31 } }, at: T0 - 5, received_at: T0, user_id: owner.user.id, device_id: 'device-a', applied: 1,
  });
});
