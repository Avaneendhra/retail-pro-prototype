// The store engine with Supabase as its server: the real database functions (in PGlite),
// two devices of one shop, offline sales, staff, and signing out and back in.
import { it, expect } from 'vitest';
import { createEngine } from './engine.js';
import { memoryStorage } from './storage.js';
import { createSupabaseApi } from './supabase.js';
import { billId, billNo } from './ids.js';
import { makeDb, person, fakeSupabase } from './testing/pgSupabase.js';

const T0 = new Date(2026, 10, 16, 12).getTime();
const MILK = { id: 'P1', code: 'ML', barcode: '8901262010016', name: 'Milk 500ml', names: {}, aliases: [], category: 'dairy', price: 30, min: 20, coverDays: 2, quantity: 40, needsReview: false, createdAt: T0 };
const tinyShop = () => ({
  data: { products: [MILK], bills: [], purchaseOrders: [], invoices: [], shop: { name: 'My Store' } },
  outbox: [], cursor: 0, counters: { bill: 1025, po: 101, sku: 1017 }, device: { id: null, no: 0 },
});
let serial = 0;

/** One browser, signed in as `who` (changeable, like signing in or out with Supabase). */
function device(db, who, { deviceId = `device-${++serial}`, storage = memoryStorage(), online = { yes: true } } = {}) {
  const signedIn = { who };
  let box = null;
  const client = fakeSupabase(db, () => signedIn.who);
  const offlineClient = {
    rpc: (...args) => (online.yes ? client.rpc(...args) : Promise.reject(new TypeError('Failed to fetch'))),
    auth: client.auth,
  };
  const engine = createEngine({
    storage, deviceId, deviceName: `Test ${deviceId}`,
    sessionStore: { get: () => box, set: (v) => { box = v; } },
    api: createSupabaseApi(offlineClient),
    now: () => T0,
    makeId: () => `op-${deviceId}-${++serial}`,
    seed: tinyShop,
    defer: () => {},
  });
  const data = () => engine.getSnapshot().data;
  return {
    engine, signedIn, online, data,
    stock: (id) => data().products.find((p) => p.id === id)?.quantity,
    sell(id, qty) {
      const { n, code } = engine.takeNumber('bill');
      const bill = { id: billId(code, n), billNo: billNo(code, n), at: T0, total: qty * 30, payment: { method: 'cash' }, items: [{ productId: id, name: 'Milk 500ml', qty, price: 30, total: qty * 30 }] };
      engine.dispatch('sale', { bill });
      return bill;
    },
  };
}

it('an owner signs in for the first time, creates the shop with this device’s data, and a second device gets it', async () => {
  const db = await makeDb();
  const owner = person({ email: 'lakshmi@example.com' });
  const a = device(db, owner);
  await a.engine.start();

  expect(await a.engine.continueCloud()).toEqual({ needsShop: true, logins: ['lakshmi@example.com'] });
  await a.engine.createCloudShop({ shopName: 'Sri Lakshmi Stores', name: 'Lakshmi', keepDeviceData: true });
  await a.engine.syncNow();
  const b = device(db, owner);
  await b.engine.start();
  await b.engine.continueCloud();
  await b.engine.syncNow();

  expect(a.engine.getSnapshot()).toMatchObject({ mode: 'account', account: { user: { role: 'owner' }, shop: { name: 'Sri Lakshmi Stores' }, device: { no: 1 } } });
  expect(a.engine.getSnapshot().sync).toMatchObject({ status: 'idle', pending: 0, rejected: [] });
  expect(b.engine.getSnapshot().account.device.no).toBe(2);
  expect(b.stock('P1')).toBe(40);
});

it('sales made offline on two devices both count once the internet is back', async () => {
  const db = await makeDb();
  const owner = person();
  const a = device(db, owner);
  await a.engine.start();
  await a.engine.continueCloud();
  await a.engine.createCloudShop({ shopName: 'Shop', name: 'Owner', keepDeviceData: true });
  await a.engine.syncNow();
  const b = device(db, owner);
  await b.engine.start();
  await b.engine.continueCloud();
  await b.engine.syncNow();

  a.online.yes = false;
  a.sell('P1', 2);
  await a.engine.syncNow();
  expect(a.engine.getSnapshot().sync.status).toBe('offline');
  expect(a.stock('P1')).toBe(38);
  b.sell('P1', 1);
  await b.engine.syncNow();
  a.online.yes = true;
  await a.engine.syncNow();
  await b.engine.syncNow();

  expect(a.stock('P1')).toBe(37);
  expect(b.stock('P1')).toBe(37);
  expect(a.data().bills).toHaveLength(2);
  expect(new Set(a.data().bills.map((x) => x.id)).size).toBe(2);
});

it('when the Supabase sign-in ends, sync asks to sign in again and nothing is lost', async () => {
  const db = await makeDb();
  const owner = person();
  const a = device(db, owner);
  await a.engine.start();
  await a.engine.continueCloud();
  await a.engine.createCloudShop({ shopName: 'Shop', name: 'Owner' });
  await a.engine.syncNow();

  a.signedIn.who = null;
  a.sell('P1', 1); // the shop has no products in the cloud yet: the bill is still kept
  await a.engine.syncNow();
  expect(a.engine.getSnapshot().sync.status).toBe('auth');
  expect(a.engine.getSnapshot().sync.pending).toBe(1);

  a.signedIn.who = owner;
  await a.engine.continueCloud();
  await a.engine.syncNow();
  expect(a.engine.getSnapshot().sync).toMatchObject({ status: 'idle', pending: 0 });
  expect(a.data().bills).toHaveLength(1);
});

it('a staff member added by email joins the same shop when they sign in with it', async () => {
  const db = await makeDb();
  const owner = person();
  const a = device(db, owner);
  await a.engine.start();
  await a.engine.continueCloud();
  await a.engine.createCloudShop({ shopName: 'Shop', name: 'Owner', keepDeviceData: true });
  await a.engine.syncNow();
  const api = createSupabaseApi(fakeSupabase(db, () => owner));
  await api.team.add({ login: 'ravi@example.com', name: 'Ravi' });

  const ravi = device(db, person({ email: 'ravi@example.com' }));
  await ravi.engine.start();
  await ravi.engine.continueCloud();
  await ravi.engine.syncNow();

  expect(ravi.engine.getSnapshot().account).toMatchObject({ user: { name: 'Ravi', role: 'staff' }, shop: { name: 'Shop' } });
  expect(ravi.stock('P1')).toBe(40);
});
