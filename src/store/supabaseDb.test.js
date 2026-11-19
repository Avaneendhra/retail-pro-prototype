// The Supabase database (supabase/migrations) run in a real Postgres (PGlite), with a
// stand-in for Supabase's auth schema: auth.jwt() and auth.uid() read the claims we set.
import { it, expect } from 'vitest';

import { makeDb, person, call } from './testing/pgSupabase.js';

const T0 = Date.UTC(2026, 10, 16, 6);

const sync = (db, who, body) => call(db, who, 'stokd_sync', [{ deviceId: 'device-a', since: 0, ...body }]);
let opSerial = 0;
const op = (type, fields) => ({ id: `op-${++opSerial}`, type, at: T0, ...fields });
const milk = (fields = {}) => op('product.create', { product: { id: 'P1', name: 'Milk 500ml', code: 'ML', barcode: '8901262010016', price: 30, quantity: 40, min: 20, ...fields } });
const sale = (qty, billId = `BA${++opSerial}`) => op('sale', { bill: { id: billId, billNo: billId.slice(1), at: T0, total: qty * 30, payment: { method: 'cash' }, items: [{ productId: 'P1', name: 'Milk 500ml', qty, price: 30, total: qty * 30 }] } });

async function ownerShop() {
  const db = await makeDb();
  const owner = person();
  await call(db, owner, 'stokd_create_shop', [{ shopName: 'Sri Lakshmi Stores', name: 'Lakshmi', deviceId: 'device-a', deviceName: 'Chrome on Android' }]);
  await sync(db, owner, { ops: [milk()] });
  return { db, owner };
}
const stock = async (db) => (await db.query(`select quantity from public.products where id = 'P1'`)).rows[0]?.quantity;

it('a first sign-in has no shop; creating one makes the person its owner on device 1', async () => {
  const db = await makeDb();
  const owner = person({ email: 'Lakshmi@Example.com' });

  expect(await call(db, owner, 'stokd_session', [{ deviceId: 'device-a' }])).toMatchObject({ needsShop: true, logins: ['lakshmi@example.com'] });
  const res = await call(db, owner, 'stokd_create_shop', [{ shopName: 'Sri Lakshmi Stores', name: 'Lakshmi', deviceId: 'device-a' }]);

  expect(res).toMatchObject({ user: { name: 'Lakshmi', login: 'lakshmi@example.com', role: 'owner' }, shop: { name: 'Sri Lakshmi Stores', phone: '', radiusKm: 2 }, device: { id: 'device-a', no: 1 } });
  expect(await call(db, owner, 'stokd_session', [{ deviceId: 'device-b' }])).toMatchObject({ device: { no: 2 } });
  await expect(call(db, owner, 'stokd_create_shop', [{ shopName: 'Again' }])).rejects.toThrow(/already_member/);
});

it('without signing in, nothing works', async () => {
  const db = await makeDb();
  await expect(call(db, null, 'stokd_sync', [{ deviceId: 'd' }])).rejects.toThrow(/unauthorized|permission denied/);
  await expect(call(db, null, 'stokd_sync', [{ deviceId: 'd' }], 'anon')).rejects.toThrow(/permission denied/);
});

it('the tables cannot be read or written directly, only through the functions', async () => {
  const { db, owner } = await ownerShop();
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(owner)]);
  for (const role of ['authenticated', 'anon']) {
    await db.exec(`set role ${role}`);
    await expect(db.query('select * from public.products')).rejects.toThrow(/permission denied/);
    await expect(db.query(`update public.products set quantity = 0`)).rejects.toThrow(/permission denied/);
    await db.exec('reset role');
  }
});

it('a sale reduces stock once, even when sent twice, and another device receives it', async () => {
  const { db, owner } = await ownerShop();
  const s = sale(2, 'BA1001');

  const first = await sync(db, owner, { ops: [s] });
  const again = await sync(db, owner, { ops: [s] });
  const other = await sync(db, owner, { deviceId: 'device-b' });

  expect(first.accepted).toEqual([s.id]);
  expect(again.accepted).toEqual([s.id]);
  expect(await stock(db)).toBe(38);
  expect(other.changes.products).toEqual([expect.objectContaining({ id: 'P1', quantity: 38, price: 30, min: 20 })]);
  expect(other.changes.bills).toEqual([expect.objectContaining({ id: 'BA1001', billNo: 'A1001', total: 60, deviceNo: 1 })]);
  expect(other.device.no).toBe(2);
  expect(other.cursor).toBe(first.cursor);
  expect(other.more).toBe(false);
});

it('a change with bad data is rejected and undone; the others in the request still apply', async () => {
  const { db, owner } = await ownerShop();
  const bad = op('sale', { bill: { id: 'BX', billNo: 'X', at: T0, total: 'lots', items: [{ productId: 'P1', qty: 1 }] } });
  const good = sale(1);

  const res = await sync(db, owner, { ops: [bad, op('loyalty.award', {}), good] });

  expect(res.accepted).toEqual([good.id]);
  expect(res.rejected.map((r) => r.reason)).toEqual([expect.stringMatching(/^invalid/), 'unknown_type']);
  expect(await stock(db)).toBe(39);
  expect((await db.query(`select count(*)::int n from public.ops where id = $1`, [bad.id])).rows[0].n).toBe(0);
});

it('staff join by the email the owner added, sell, but cannot rename the shop', async () => {
  const { db, owner } = await ownerShop();
  await call(db, owner, 'stokd_team_add', [{ login: 'Ravi@Example.com', name: 'Ravi' }]);
  const ravi = person({ email: 'ravi@example.com' });

  const session = await call(db, ravi, 'stokd_session', [{ deviceId: 'device-r' }]);
  const res = await sync(db, ravi, { deviceId: 'device-r', ops: [sale(1), op('shop.update', { name: 'Ravi Stores' })] });

  expect(session).toMatchObject({ user: { name: 'Ravi', role: 'staff' }, shop: { name: 'Sri Lakshmi Stores' } });
  expect(res.rejected).toEqual([expect.objectContaining({ reason: 'forbidden' })]);
  expect(await stock(db)).toBe(39);
  expect(await call(db, owner, 'stokd_team_list')).toEqual([
    expect.objectContaining({ role: 'owner', joined: true }),
    expect.objectContaining({ login: 'ravi@example.com', role: 'staff', joined: true }),
  ]);
  await expect(call(db, ravi, 'stokd_team_list')).rejects.toThrow(/forbidden/);

  await call(db, owner, 'stokd_team_update', [{ login: 'ravi@example.com', disabled: true }]);
  await expect(sync(db, ravi, { deviceId: 'device-r' })).rejects.toThrow(/forbidden/);
});

it('a phone sign-in joins by the 10-digit number the owner typed', async () => {
  const { db, owner } = await ownerShop();
  await call(db, owner, 'stokd_team_add', [{ login: '+91 98765 43210', name: 'Sita' }]);
  const sita = person({ email: undefined, phone: '919876543210' });

  expect(await call(db, sita, 'stokd_session', [{ deviceId: 'device-s' }])).toMatchObject({ user: { login: '9876543210', role: 'staff' } });
});

it('one shop never sees another shop’s rows', async () => {
  const { db, owner } = await ownerShop();
  const other = person();
  await call(db, other, 'stokd_create_shop', [{ shopName: 'Other', deviceId: 'device-x' }]);

  const res = await sync(db, other, { deviceId: 'device-x', ops: [op('product.delete', { productId: 'P1' }), sale(5)] });

  expect(res.changes.products).toEqual([]);
  expect(await stock(db)).toBe(40);
  expect((await sync(db, owner)).changes.products[0]).toMatchObject({ quantity: 40 });
});

it('shop delivery settings, customers and the order link work end to end', async () => {
  const { db, owner } = await ownerShop();
  const shopId = (await call(db, owner, 'stokd_session', [{ deviceId: 'device-a' }])).shop.id;
  await sync(db, owner, { ops: [
    op('shop.update', { phone: '9000000000', location: { lat: 17.36, lng: 78.47 }, radiusKm: 2 }),
    op('customer.save', { customer: { id: 'C1', name: 'Ravi', phone: '9111111111', code: 'K7Q2M9XA', loyal: true, source: 'contacts' } }),
  ] });
  const before = await sync(db, owner);

  const menu = await call(db, null, 'stokd_public_menu', [shopId, 'K7Q2M9XA'], 'anon');
  const placed = await call(db, null, 'stokd_public_order', [{ shop: shopId, code: 'K7Q2M9XA', name: 'Ravi K', items: [{ productId: 'P1', qty: 2 }, { productId: 'P404', qty: 1 }], location: { lat: 17.37, lng: 78.47 } }], 'anon');
  const res = await sync(db, owner, { since: before.cursor });

  expect(before.shop).toMatchObject({ phone: '9000000000', location: { lat: 17.36, lng: 78.47 }, radiusKm: 2 });
  expect(menu).toEqual({ shop: { name: 'Sri Lakshmi Stores', phone: '9000000000' }, name: 'Ravi', items: [['P1', 'Milk 500ml', 30]] });
  expect(placed.ok).toBe(true);
  const [order] = res.changes.orders;
  expect(order).toMatchObject({ customerId: 'C1', name: 'Ravi K', phone: '9111111111', status: 'new', items: [{ productId: 'P1', name: 'Milk 500ml', qty: 2, price: 30 }] });
  expect(order.km).toBeGreaterThan(1);
  expect(order.km).toBeLessThan(1.2);

  await expect(call(db, null, 'stokd_public_menu', [shopId, 'ZZZZZZZZ'], 'anon')).rejects.toThrow(/not_found/);
  await expect(call(db, null, 'stokd_public_order', [{ shop: shopId, code: 'K7Q2M9XA', items: [] }], 'anon')).rejects.toThrow(/invalid_input/);
  for (let i = 0; i < 9; i += 1) await call(db, null, 'stokd_public_order', [{ shop: shopId, code: 'K7Q2M9XA', items: [{ productId: 'P1', qty: 1 }] }], 'anon');
  await expect(call(db, null, 'stokd_public_order', [{ shop: shopId, code: 'K7Q2M9XA', items: [{ productId: 'P1', qty: 1 }] }], 'anon')).rejects.toThrow(/too_many_orders/);

  const accept = await sync(db, owner, { ops: [op('order.update', { orderId: order.id, patch: { status: 'accepted', billId: 'BA9' } })] });
  expect(accept.changes.orders.find((o) => o.id === order.id)).toMatchObject({ status: 'accepted', billId: 'BA9' });
});

it('purchase orders add stock once, on receipt', async () => {
  const { db, owner } = await ownerShop();
  const po = { id: 'PO1', poNo: '101', supplier: '', status: 'draft', items: [{ productId: 'P1', qty: 10 }], createdAt: T0 };
  const receive = op('po.receive', { poId: 'PO1', lines: [{ productId: 'P1', delta: 10 }] });

  await sync(db, owner, { ops: [op('po.create', { po }), op('po.update', { poId: 'PO1', patch: { supplier: 'ABC', status: 'sent' } }), receive] });
  await sync(db, owner, { ops: [op('po.receive', { poId: 'PO1', lines: [{ productId: 'P1', delta: 10 }] })] });

  expect(await stock(db)).toBe(50);
  expect((await sync(db, owner)).changes.purchaseOrders[0]).toMatchObject({ supplier: 'ABC', status: 'received', receivedAt: T0 });
});

it('a big shop is read in pages, never cutting rows changed together', async () => {
  const db = await makeDb();
  const owner = person();
  await call(db, owner, 'stokd_create_shop', [{ shopName: 'Big', deviceId: 'device-a' }]);
  const ops = [];
  for (let k = 0; k < 6; k += 1) ops.push(op('import', { products: Array.from({ length: 100 }, (_, i) => ({ id: `P${k * 100 + i}`, name: `Item ${k * 100 + i}` })) }));
  await sync(db, owner, { ops });

  const first = await sync(db, owner, { deviceId: 'device-b' });
  const second = await sync(db, owner, { deviceId: 'device-b', since: first.cursor });

  expect(first.more).toBe(true);
  expect(first.changes.products).toHaveLength(500);
  expect(second.more).toBe(false);
  expect(first.changes.products.length + second.changes.products.length).toBe(600);
});

it('monthly sales cover the whole history', async () => {
  const { db, owner } = await ownerShop();
  const oct = Date.UTC(2026, 9, 10, 6);
  await sync(db, owner, { ops: [sale(2), op('import', { bills: [{ id: 'BOLD', billNo: 'OLD', at: oct, total: 90, payment: { method: 'upi' }, items: [{ productId: 'P1', qty: 3, price: 30, total: 90 }] }] })] });

  expect(await call(db, owner, 'stokd_monthly')).toEqual([{ month: '2026-10', total: 90, bills: 1 }, { month: '2026-11', total: 60, bills: 1 }]);
});
