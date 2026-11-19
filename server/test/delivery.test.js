import test from 'node:test';
import assert from 'node:assert/strict';
import { call, sync, shopWithMilk, createProductOp, saleOp, opId, stockOf, T0, HOUR } from './helpers.js';

const RAVI = { id: 'C1', name: 'Ravi', phone: '9111111111', code: 'K7Q2M9XA', loyal: true, source: 'contacts', location: null, createdAt: T0 };
const saveRavi = (fields = {}) => ({ id: opId(), type: 'customer.save', at: T0, customer: { ...RAVI, ...fields } });

/** A shop with Milk, Bread (out of stock) and Ravi on its loyal list. */
async function deliveryShop() {
  const ctx = await shopWithMilk();
  await sync(ctx.app, ctx.owner.token, {
    ops: [
      createProductOp({ id: 'P2', name: 'Bread', code: 'BR', barcode: '', price: 40, quantity: 0 }),
      saveRavi(),
      { id: opId(), type: 'shop.update', at: T0, phone: '9000000000', location: { lat: 17.36, lng: 78.47 }, radiusKm: 2 },
    ],
  });
  return ctx;
}

const order = (fields = {}) => ({
  shop: null, code: RAVI.code, name: 'Ravi K', address: 'Flat 4, Sai Residency', note: 'Ring twice',
  items: [{ productId: 'P1', qty: 2 }], location: { lat: 17.37, lng: 78.47 }, ...fields,
});
const sendOrder = (app, shopId, fields) => call(app, 'POST', '/api/public/orders', { body: order({ shop: shopId, ...fields }) });

test('customers, the shop\'s delivery settings and the customer on a bill sync to every device', async () => {
  const { app, owner } = await deliveryShop();
  const sale = saleOp([['P1', 1]]);
  sale.bill.customer = { phone: '9111111111', name: 'Ravi' };
  await sync(app, owner.token, { ops: [sale] });

  const res = await sync(app, owner.token, { deviceId: 'device-b' });

  assert.equal(res.status, 200);
  assert.deepEqual(res.changes.customers, [RAVI]);
  assert.deepEqual(res.shop, { id: owner.shop.id, name: 'Sri Lakshmi Stores', phone: '9000000000', location: { lat: 17.36, lng: 78.47 }, radiusKm: 2 });
  assert.deepEqual(res.changes.bills.find((b) => b.id === sale.bill.id).customer, { phone: '9111111111', name: 'Ravi' });
});

test('customer.save updates a customer and customer.delete removes it', async () => {
  const { app, owner } = await deliveryShop();
  const before = await sync(app, owner.token);

  await sync(app, owner.token, { ops: [saveRavi({ name: 'Ravi Kumar' })] });
  const renamed = await sync(app, owner.token, { since: before.cursor });
  assert.equal(renamed.changes.customers[0].name, 'Ravi Kumar');

  await sync(app, owner.token, { ops: [{ id: opId(), type: 'customer.delete', at: T0, customerId: 'C1' }] });
  const gone = await sync(app, owner.token, { since: renamed.cursor });
  assert.deepEqual(gone.changes.customers, [{ id: 'C1', deleted: true }]);
});

test('a customer\'s link shows the shop\'s items in stock and today\'s prices; a wrong code shows nothing', async () => {
  const { app, owner } = await deliveryShop();

  const res = await call(app, 'GET', `/api/public/menu?shop=${owner.shop.id}&code=${RAVI.code}`);

  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { shop: { name: 'Sri Lakshmi Stores', phone: '9000000000' }, name: 'Ravi', items: [['P1', 'Milk 500ml', 30]] });
  assert.equal((await call(app, 'GET', `/api/public/menu?shop=${owner.shop.id}&code=ZZZZZZZZ`)).status, 404);
});

test('an order from a loyal customer\'s link reaches the shop\'s app, with their saved number and the distance', async () => {
  const { app, owner } = await deliveryShop();
  const before = await sync(app, owner.token);

  const sent = await sendOrder(app, owner.shop.id, { items: [{ productId: 'P1', qty: 2 }, { productId: 'P404', qty: 1 }] });
  const res = await sync(app, owner.token, { since: before.cursor });

  assert.equal(sent.status, 201);
  assert.equal(res.changes.orders.length, 1);
  const got = res.changes.orders[0];
  assert.equal(got.customerId, 'C1');
  assert.equal(got.name, 'Ravi K');
  assert.equal(got.phone, '9111111111', 'the number comes from the loyal list, not from what was typed');
  assert.deepEqual(got.items, [{ productId: 'P1', name: 'Milk 500ml', qty: 2, price: 30 }], 'unknown items are dropped and prices are the shop\'s');
  assert.equal(got.status, 'new');
  assert.equal(got.address, 'Flat 4, Sai Residency');
  assert.ok(got.km > 1 && got.km < 1.2, `about 1.1 km, got ${got.km}`);
});

test('an order with a code that is not on the loyal list, or with nothing in it, is refused', async () => {
  const { app, owner } = await deliveryShop();

  assert.equal((await sendOrder(app, owner.shop.id, { code: 'ZZZZZZZZ' })).status, 404);
  assert.equal((await sendOrder(app, 'no-such-shop')).status, 404);
  assert.equal((await sendOrder(app, owner.shop.id, { items: [] })).status, 400);
  assert.equal((await sendOrder(app, owner.shop.id, { items: [{ productId: 'P404', qty: 1 }] })).status, 400);
});

test('one customer can send at most 10 orders a day', async () => {
  const { app, owner, clock } = await deliveryShop();

  for (let i = 0; i < 10; i += 1) assert.equal((await sendOrder(app, owner.shop.id)).status, 201);
  assert.equal((await sendOrder(app, owner.shop.id)).status, 429);

  clock.t += 25 * HOUR;
  assert.equal((await sendOrder(app, owner.shop.id)).status, 201);
});

test('accepting an order once records the bill; a second answer is ignored', async () => {
  const { app, db, owner } = await deliveryShop();
  await sendOrder(app, owner.shop.id);
  const { changes, cursor } = await sync(app, owner.token);
  const orderId = changes.orders[0].id;
  const sale = saleOp([['P1', 2]]);

  await sync(app, owner.token, { ops: [sale, { id: opId(), type: 'order.update', at: T0, orderId, patch: { status: 'accepted', billId: sale.bill.id } }] });
  await sync(app, owner.token, { ops: [{ id: opId(), type: 'order.update', at: T0, orderId, patch: { status: 'declined' } }] });
  const res = await sync(app, owner.token, { since: cursor });

  assert.equal(await stockOf(db, 'P1'), 38);
  assert.deepEqual(
    { status: res.changes.orders[0].status, billId: res.changes.orders[0].billId },
    { status: 'accepted', billId: sale.bill.id },
  );
});
