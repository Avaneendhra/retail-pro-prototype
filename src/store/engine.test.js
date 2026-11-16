// The store engine, driven the way the app drives it, against the real API
// running in-process on an in-memory database. Each "device" is one engine
// with its own storage; the "network" can be switched off or made to lose answers.
import { it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../server/src/app.js';
import { openNodeDb, migrate } from '../../server/src/db/node.js';
import { deriveAuthKey } from '../../shared/auth.js';
import { seedDataset } from '../data/seed.js';
import { createApi } from './api.js';
import { createEngine } from './engine.js';
import { memoryStorage } from './storage.js';
import { billId, billNo, poId, poNo, productId } from './ids.js';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'server', 'migrations');
const T0 = new Date(2026, 10, 16, 12).getTime();
const DAY = 86_400_000;
const OWNER = { shopName: 'Sri Lakshmi Stores', name: 'Lakshmi', login: '98765 43210', password: 'correct horse' };

const MILK = {
  id: 'P1', code: 'ML', barcode: '8901262010016', name: 'Milk 500ml', names: { te: 'పాలు 500ml' }, aliases: ['milk'], category: 'dairy',
  price: 30, min: 20, coverDays: 2, quantity: 40, needsReview: false, createdAt: T0,
};
const tinyShop = () => ({
  data: { products: [MILK], bills: [], purchaseOrders: [], invoices: [], shop: { name: 'My Store' } },
  outbox: [], cursor: 0, counters: { bill: 1025, po: 101, sku: 1017 }, device: { id: null, no: 0 },
});

function makeServer() {
  const db = openNodeDb(':memory:');
  migrate(db, MIGRATIONS);
  const clock = { t: T0 };
  const logs = [];
  const config = { jwtSecret: 'engine-test-secret-engine-test-secret', allowedOrigins: [], signupCode: null, version: 'test' };
  const app = createApp(() => ({ db, config, now: () => clock.t, ip: '10.0.0.1', log: (error) => logs.push(String(error?.stack || error)) }));
  const net = { online: true, loseResponses: 0, syncBodies: [], bodyBytes: [] };
  const fetchImpl = async (url, init = {}) => {
    if (!net.online) throw new TypeError('Failed to fetch');
    if (String(url).endsWith('/api/sync')) {
      net.syncBodies.push(JSON.parse(init.body));
      net.bodyBytes.push(new TextEncoder().encode(init.body).length);
    }
    const res = await app.request(url, init);
    if (net.loseResponses > 0) {
      net.loseResponses -= 1;
      throw new TypeError('connection reset');
    }
    return res;
  };
  const one = async (sql, args) => (await db.query(sql, args))[0];
  return {
    db, clock, net, logs,
    api: createApi('http://shop.test', fetchImpl),
    stock: async (id) => (await one('SELECT quantity FROM products WHERE id = ?', [id]))?.quantity,
    count: async (table) => (await one(`SELECT COUNT(*) AS n FROM ${table}`)).n,
  };
}

let opSerial = 0;
let deviceSerial = 0;
const sessionBox = () => {
  let value = null;
  return { get: () => value, set: (next) => { value = next; } };
};

/** One browser. Pass the same `storage`, `sessionStore` and `deviceId` again to simulate reopening it. */
function makeDevice(server, { deviceId = `device-${++deviceSerial}`, storage = memoryStorage(), sessionStore = sessionBox(), seed = tinyShop, legacy } = {}) {
  const deferred = [];
  const engine = createEngine({
    storage, sessionStore, deviceId, deviceName: `Test ${deviceId}`, legacy,
    api: server.api,
    now: () => server.clock.t,
    makeId: () => `op-${++opSerial}`,
    seed,
    defer: (fn) => deferred.push(fn),
    deriveKey: (login, password) => deriveAuthKey(login, password, 1000),
  });
  const view = () => engine.getSnapshot();
  return {
    engine, storage, sessionStore, deviceId, deferred, view,
    data: () => view().data,
    stock: (id) => view().data.products.find((p) => p.id === id)?.quantity,
    sell(lines, at = server.clock.t) {
      const { n, code } = engine.takeNumber('bill');
      const items = lines.map(([id, qty]) => {
        const p = view().data.products.find((x) => x.id === id);
        return { productId: id, name: p.name, names: p.names, code: p.code, qty, price: p.price, total: qty * p.price };
      });
      const bill = { id: billId(code, n), billNo: billNo(code, n), at, total: items.reduce((sum, i) => sum + i.total, 0), payment: { method: 'cash' }, items };
      engine.dispatch('sale', { bill });
      return bill;
    },
    reopen: (overrides = {}) => makeDevice(server, { deviceId, storage, sessionStore, seed, ...overrides }),
  };
}

/** A shop with one owner device signed up (keeping the tiny sample shop) and synced. */
async function shopWithOwner({ keepDeviceData = true, seed = tinyShop } = {}) {
  const server = makeServer();
  const a = makeDevice(server, { seed });
  await a.engine.start();
  const { recoveryCode } = await a.engine.signUp({ ...OWNER, keepDeviceData });
  await a.engine.syncNow();
  return { server, a, recoveryCode };
}

async function secondDevice(server, options) {
  const b = makeDevice(server, options);
  await b.engine.start();
  await b.engine.signIn({ login: OWNER.login, password: OWNER.password });
  await b.engine.syncNow();
  return b;
}

const withoutServerFields = (data) => ({ ...data, bills: data.bills.map(({ deviceNo, userId, ...bill }) => bill) });

/* ── local mode ───────────────────────────────────────────────── */

it('in local mode a sale is saved and is still there after a restart', async () => {
  const server = makeServer();
  const a = makeDevice(server);
  await a.engine.start();
  const before = a.view();

  const bill = a.sell([['P1', 2]]);
  await a.engine.settled();
  const again = a.reopen();
  await again.engine.start();

  expect(before.ready).toBe(true);
  expect(before.mode).toBe('local');
  expect(before.account).toBe(null);
  expect(before.sync.status).toBe('off');
  expect(bill.id).toBe('B1025');
  expect(again.stock('P1')).toBe(38);
  expect(again.data().bills.map((b) => b.id)).toEqual(['B1025']);
  expect(again.engine.takeNumber('bill')).toEqual({ n: 1026, code: '' });
  expect(server.net.syncBodies).toEqual([]);
});

it('is not ready until it has started, and tells subscribers about every change', async () => {
  const server = makeServer();
  const a = makeDevice(server);
  let calls = 0;
  const unsubscribe = a.engine.subscribe(() => { calls += 1; });

  const early = a.view();
  await a.engine.start();
  const started = a.view();
  a.sell([['P1', 1]]);
  const callsAfterSale = calls;
  unsubscribe();
  a.sell([['P1', 1]]);

  expect(early.ready).toBe(false);
  expect(started.ready).toBe(true);
  expect(a.engine.getSnapshot()).toBe(a.engine.getSnapshot());
  expect(callsAfterSale).toBeGreaterThanOrEqual(2);
  expect(calls).toBe(callsAfterSale);
});

it('resetLocal brings the sample shop back', async () => {
  const server = makeServer();
  const a = makeDevice(server);
  await a.engine.start();
  a.sell([['P1', 5]]);

  await a.engine.resetLocal();
  const again = a.reopen();
  await again.engine.start();

  expect(a.stock('P1')).toBe(40);
  expect(again.data().bills).toEqual([]);
});

it('data saved by an older version of the app is taken over once', async () => {
  const server = makeServer();
  const old = { ...tinyShop(), data: { ...tinyShop().data, products: [{ ...MILK, quantity: 7 }] }, counters: { bill: 1100, po: 101, sku: 1017 } };
  const legacy = { cleared: 0, read: () => old, clear() { this.cleared += 1; } };
  const a = makeDevice(server, { legacy });

  await a.engine.start();
  await a.engine.settled();
  const again = a.reopen({ legacy: { read: () => { throw new Error('must not be read again'); }, clear() {} } });
  await again.engine.start();

  expect(a.stock('P1')).toBe(7);
  expect(legacy.cleared).toBe(1);
  expect(again.stock('P1')).toBe(7);
  expect(again.engine.takeNumber('bill').n).toBe(1100);
});

it('without an account, bills older than a year are let go at start', async () => {
  const server = makeServer();
  const bill = (id, at) => ({ id, billNo: id, at, total: 30, payment: { method: 'cash' }, items: [{ productId: 'P1', name: 'Milk', qty: 1, price: 30, total: 30 }] });
  const seed = () => ({ ...tinyShop(), data: { ...tinyShop().data, bills: [bill('B3', T0), bill('B2', T0 - 300 * DAY), bill('B1', T0 - 400 * DAY)] } });
  const a = makeDevice(server, { seed });

  await a.engine.start();

  expect(a.data().bills.map((b) => b.id)).toEqual(['B3', 'B2']);
});

/* ── accounts ─────────────────────────────────────────────────── */

it('signing up and keeping device data uploads products and bills, and a second device sees them', async () => {
  const server = makeServer();
  const a = makeDevice(server, { seed: seedDataset });
  await a.engine.start();
  a.sell([['P1001', 2]]);

  const { recoveryCode } = await a.engine.signUp({ ...OWNER, keepDeviceData: true });
  const optimistic = a.view();
  await a.engine.syncNow();
  const b = await secondDevice(server);

  expect(recoveryCode).toMatch(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
  expect(optimistic.mode).toBe('account');
  expect(optimistic.data.products).toHaveLength(16);
  expect(a.view().sync).toMatchObject({ status: 'idle', pending: 0, error: null, rejected: [] });
  expect(a.view().account).toMatchObject({ user: { name: 'Lakshmi', login: '9876543210', role: 'owner' }, shop: { name: 'Sri Lakshmi Stores' }, device: { no: 1 } });
  expect(a.stock('P1001')).toBe(38);
  const billsExpected = seedDataset(T0).data.bills.length + 1;
  expect(a.data().bills).toHaveLength(billsExpected);
  expect(await server.count('products')).toBe(16);
  expect(await server.count('bills')).toBe(billsExpected);
  expect(b.view().account.device.no).toBe(2);
  expect(b.data()).toEqual(a.data());
  expect(a.data().shop).toEqual({ name: 'Sri Lakshmi Stores' });
});

it('after signing up with the device data, signing out shows a fresh sample shop, not a stale copy', async () => {
  const { a } = await shopWithOwner();
  a.sell([['P1', 4]]);
  await a.engine.syncNow();

  await a.engine.signOut();

  expect(a.view().mode).toBe('local');
  expect(a.stock('P1')).toBe(40);
  expect(a.data().bills).toEqual([]);
});

it('signing up empty gives an empty shop on every device', async () => {
  const { server, a } = await shopWithOwner({ keepDeviceData: false });
  const b = await secondDevice(server);

  const first = a.engine.takeNumber('bill');
  await a.engine.signOut();

  expect(first).toEqual({ n: 1, code: 'A' });
  expect(b.data().products).toEqual([]);
  expect(b.data().bills).toEqual([]);
  expect(b.engine.takeNumber('sku')).toEqual({ n: 1, code: 'B' });
  expect(a.stock('P1')).toBe(40);
});

it('a login that is taken, or a wrong password, fails with a reason and changes nothing', async () => {
  const { server } = await shopWithOwner();
  const b = makeDevice(server);
  await b.engine.start();

  const taken = await b.engine.signUp({ ...OWNER, keepDeviceData: false }).catch((error) => error);
  const wrong = await b.engine.signIn({ login: OWNER.login, password: 'wrong horse' }).catch((error) => error);
  const notALogin = await b.engine.signIn({ login: 'lakshmi', password: 'x' }).catch((error) => error);

  expect(taken).toMatchObject({ status: 409, code: 'login_taken' });
  expect(wrong).toMatchObject({ status: 401, code: 'bad_credentials' });
  expect(notALogin).toMatchObject({ code: 'invalid_login' });
  expect(b.view().mode).toBe('local');
  expect(b.sessionStore.get()).toBe(null);
  expect(b.stock('P1')).toBe(40);
});

it('the recovery code sets a new password and signs the device in', async () => {
  const { server, recoveryCode } = await shopWithOwner();
  const b = makeDevice(server);
  await b.engine.start();

  const fresh = await b.engine.recover({ login: OWNER.login, recoveryCode, password: 'brand new password' });
  await b.engine.syncNow();
  const c = makeDevice(server);
  await c.engine.start();
  await c.engine.signIn({ login: OWNER.login, password: 'brand new password' });

  expect(fresh.recoveryCode).not.toBe(recoveryCode);
  expect(b.view().mode).toBe('account');
  expect(b.stock('P1')).toBe(40);
  expect(c.view().mode).toBe('account');
});

it('changing the password keeps this device signed in and syncing', async () => {
  const { server, a } = await shopWithOwner();

  await a.engine.changePassword({ current: OWNER.password, next: 'another password' });
  a.sell([['P1', 1]]);
  await a.engine.syncNow();
  const wrongCurrent = await a.engine.changePassword({ current: 'nope', next: 'x'.repeat(10) }).catch((error) => error);

  expect(a.view().sync.status).toBe('idle');
  expect(await server.stock('P1')).toBe(39);
  expect(wrongCurrent).toMatchObject({ status: 401 });
});

it('the owner adds a staff login from the device, and that login can sign in and sell', async () => {
  const { server, a } = await shopWithOwner();

  const member = await a.engine.team.add({ name: 'Ravi', login: 'ravi@example.com', password: 'staff password' });
  const b = makeDevice(server);
  await b.engine.start();
  await b.engine.signIn({ login: 'ravi@example.com', password: 'staff password' });
  await b.engine.syncNow();
  b.sell([['P1', 3]]);
  await b.engine.syncNow();
  const members = await a.engine.team.list();
  await a.engine.team.update(member.id, { login: member.login, password: 'reset password' });
  await b.engine.syncNow();

  expect(member).toMatchObject({ name: 'Ravi', role: 'staff', disabled: false });
  expect(b.view().account.user.role).toBe('staff');
  expect(await server.stock('P1')).toBe(37);
  expect(members.map((m) => m.name)).toEqual(['Lakshmi', 'Ravi']);
  expect(b.view().sync.status).toBe('auth');
});

it('says whether the server can be reached', async () => {
  const server = makeServer();
  const a = makeDevice(server);

  const up = await a.engine.checkServer();
  server.net.online = false;
  const down = await a.engine.checkServer();

  expect(up).toBe(true);
  expect(down).toBe(false);
});

/* ── syncing ──────────────────────────────────────────────────── */

it('a sale on device A shows on device B with the same stock on both', async () => {
  const { server, a } = await shopWithOwner();
  const b = await secondDevice(server);

  const bill = a.sell([['P1', 2]]);
  const optimistic = a.stock('P1');
  await a.engine.syncNow();
  await b.engine.syncNow();

  expect(bill.id).toBe('BA1025');
  expect(optimistic).toBe(38);
  expect(a.stock('P1')).toBe(38);
  expect(b.stock('P1')).toBe(38);
  expect(b.data().bills.map((x) => x.id)).toEqual(['BA1025']);
  expect(await server.stock('P1')).toBe(38);
});

it('a change is sent soon after it is made, once for several changes', async () => {
  const { server, a } = await shopWithOwner();
  const requestsBefore = server.net.syncBodies.length;

  a.sell([['P1', 1]]);
  a.sell([['P1', 1]]);
  const scheduled = a.deferred.length;
  a.deferred.forEach((run) => run());
  await a.engine.syncNow();

  expect(scheduled).toBe(1);
  expect(server.net.syncBodies.length).toBe(requestsBefore + 1);
  expect(server.net.syncBodies.at(-1).ops).toHaveLength(2);
  expect(await server.stock('P1')).toBe(38);
});

it('two devices selling offline converge to the right stock', async () => {
  const { server, a } = await shopWithOwner();
  const b = await secondDevice(server);

  server.net.online = false;
  a.sell([['P1', 2]]);
  b.sell([['P1', 3]]);
  await a.engine.syncNow();
  await b.engine.syncNow();
  const offline = { a: a.view().sync, b: b.view().sync, stockA: a.stock('P1'), stockB: b.stock('P1') };
  server.net.online = true;
  await a.engine.syncNow();
  await b.engine.syncNow();
  await a.engine.syncNow();

  expect(offline.a).toMatchObject({ status: 'offline', pending: 1 });
  expect(offline.b).toMatchObject({ status: 'offline', pending: 1 });
  expect([offline.stockA, offline.stockB]).toEqual([38, 37]);
  expect([a.stock('P1'), b.stock('P1'), await server.stock('P1')]).toEqual([35, 35, 35]);
  expect(a.data().bills.map((x) => x.id).sort()).toEqual(['BA1025', 'BB1']);
  expect(b.data().bills).toEqual(a.data().bills);
});

it('a change made offline survives a restart and is sent once', async () => {
  const { server, a } = await shopWithOwner();
  server.net.online = false;
  a.sell([['P1', 2]]);
  await a.engine.settled();

  const again = a.reopen();
  await again.engine.start();
  await again.engine.syncNow();
  const whileOffline = again.view();
  server.net.online = true;
  await again.engine.syncNow();
  await again.engine.syncNow();

  expect(whileOffline.mode).toBe('account');
  expect(whileOffline.account.user.name).toBe('Lakshmi');
  expect(whileOffline.sync).toMatchObject({ status: 'offline', pending: 1 });
  expect(whileOffline.data.products[0].quantity).toBe(38);
  expect(again.view().sync).toMatchObject({ status: 'idle', pending: 0 });
  expect(await server.stock('P1')).toBe(38);
  expect(await server.count('bills')).toBe(1);
});

it('resending after a lost response does not double count', async () => {
  const { server, a } = await shopWithOwner();
  a.sell([['P1', 2]]);

  server.net.loseResponses = 1;
  await a.engine.syncNow();
  const afterLoss = { sync: a.view().sync, server: await server.stock('P1') };
  await a.engine.syncNow();

  expect(afterLoss.sync).toMatchObject({ status: 'offline', pending: 1 });
  expect(afterLoss.server).toBe(38);
  expect(a.view().sync).toMatchObject({ status: 'idle', pending: 0 });
  expect(await server.stock('P1')).toBe(38);
  expect(a.stock('P1')).toBe(38);
  expect(await server.count('bills')).toBe(1);
});

it('drains a large outbox in order', async () => {
  const { server, a } = await shopWithOwner();
  a.engine.dispatch('stock.move', { reason: 'manual', lines: [{ productId: 'P1', delta: 960 }] });
  await a.engine.syncNow();
  server.net.online = false;
  const sold = Array.from({ length: 300 }, () => a.sell([['P1', 1]]).id);
  const requestsBefore = server.net.syncBodies.length;

  server.net.online = true;
  await a.engine.syncNow();

  const requests = server.net.syncBodies.slice(requestsBefore);
  expect(requests.map((body) => body.ops.length)).toEqual(Array(12).fill(25));
  expect(requests.flatMap((body) => body.ops.map((op) => op.bill.id))).toEqual(sold);
  expect(await server.count('bills')).toBe(300);
  expect([a.stock('P1'), await server.stock('P1')]).toEqual([700, 700]);
  expect(a.view().sync).toMatchObject({ status: 'idle', pending: 0 });
  expect(a.data().bills).toHaveLength(300);
});

it('keeps each request under the size the server accepts', async () => {
  const server = makeServer();
  const bill = (n) => ({
    id: `B${n}`, billNo: String(n), at: T0 - n * 60_000, total: 600, payment: { method: 'cash' },
    items: Array.from({ length: 20 }, (_, i) => ({ productId: 'P1', name: `పాలు 500ml ప్యాకెట్ ${i}`, qty: 1, price: 30, total: 30 })),
  });
  const seed = () => ({ ...tinyShop(), data: { ...tinyShop().data, bills: Array.from({ length: 1500 }, (_, n) => bill(n)) } });
  const a = makeDevice(server, { seed });
  await a.engine.start();

  await a.engine.signUp({ ...OWNER, keepDeviceData: true });
  await a.engine.syncNow();

  expect(Math.max(...server.net.bodyBytes)).toBeLessThan(1024 * 1024);
  expect(server.net.syncBodies.length).toBeGreaterThan(2);
  expect(await server.count('bills')).toBe(1500);
  expect(a.view().sync).toMatchObject({ status: 'idle', pending: 0, rejected: [] });
  expect(a.data().bills).toHaveLength(1500);
});

it('what the device shows before a sync is what the server sends back', async () => {
  const { server, a } = await shopWithOwner();
  const { engine } = a;
  const sku = engine.takeNumber('sku');
  const po = engine.takeNumber('po');
  const invoice = { id: 'INV-A1', supplier: 'ABC Distributors', invoiceNo: 'INV-1025', dateText: '16/11/2026', units: 50, count: 1, at: T0 };

  engine.dispatch('product.create', { product: { id: productId(sku.code, sku.n), name: 'Bread', names: { hi: 'ब्रेड' }, aliases: ['pav'], code: 'BR', barcode: '', category: 'bakery', price: 40, min: 10, coverDays: 3, quantity: 8, needsReview: true, createdAt: T0 } });
  engine.dispatch('product.create', { product: { id: 'PA9999', name: 'Wrong scan', quantity: 1 } });
  engine.dispatch('product.update', { productId: 'P1', patch: { price: 32, min: 25 } });
  engine.dispatch('product.delete', { productId: 'PA9999' });
  engine.dispatch('stock.move', { reason: 'invoice', lines: [{ productId: 'P1', delta: 50 }], invoice });
  a.sell([['P1', 2], ['PA1017', 3]]);
  engine.dispatch('po.create', { po: { id: poId(po.code, po.n), poNo: poNo(po.code, po.n), supplier: 'ABC', status: 'draft', items: [{ productId: 'P1', qty: 20 }], createdAt: T0 } });
  engine.dispatch('po.create', { po: { id: 'POA900', poNo: 'A900', supplier: '', status: 'draft', items: [{ productId: 'P1', qty: 1 }], createdAt: T0 - 5 } });
  engine.dispatch('po.update', { poId: 'POA101', patch: { supplier: 'New Supplier', status: 'sent' } });
  engine.dispatch('po.receive', { poId: 'POA101', lines: [{ productId: 'P1', delta: 20 }], changes: [{ productId: 'P1', name: 'Milk 500ml', before: 88, after: 108, qty: 20 }] });
  engine.dispatch('po.delete', { poId: 'POA900' });
  engine.dispatch('shop.update', { name: 'Lakshmi Kirana' });
  const before = a.data();

  await engine.syncNow();
  const b = await secondDevice(server);

  expect(a.view().sync).toMatchObject({ status: 'idle', pending: 0, rejected: [] });
  expect(withoutServerFields(a.data())).toEqual(before);
  expect(b.data()).toEqual(a.data());
  expect(a.stock('P1')).toBe(108);
  expect(a.data().shop.name).toBe('Lakshmi Kirana');
  expect(server.logs).toEqual([]);
});

it('drops a rejected op and reports it', async () => {
  const { server, a } = await shopWithOwner();

  const unknown = a.engine.dispatch('loyalty.award', { points: 5 });
  a.sell([['P1', 1]]);
  await a.engine.syncNow();
  const requestsAfterFirst = server.net.syncBodies.length;
  await a.engine.syncNow();
  await a.engine.settled();
  const reopened = a.reopen();
  await reopened.engine.start();

  expect(a.view().sync).toMatchObject({ status: 'idle', pending: 0 });
  expect(a.view().sync.rejected).toEqual([{ id: unknown.id, type: 'loyalty.award', reason: 'unknown_type' }]);
  expect(await server.stock('P1')).toBe(39);
  expect(server.net.syncBodies.slice(requestsAfterFirst).every((body) => body.ops.length === 0)).toBe(true);
  expect(reopened.view().sync.rejected).toHaveLength(1);
});

it('a rejected change can be tried again or dismissed', async () => {
  const { a } = await shopWithOwner();
  a.engine.dispatch('loyalty.award', { points: 5 });
  await a.engine.syncNow();

  a.engine.retryRejected();
  const retrying = a.view().sync;
  await a.engine.syncNow();
  const rejectedAgain = a.view().sync.rejected.length;
  a.engine.discardRejected();

  expect(retrying).toMatchObject({ pending: 1, rejected: [] });
  expect(rejectedAgain).toBe(1);
  expect(a.view().sync.rejected).toEqual([]);
});

it('a 401 sets status auth and keeps the outbox', async () => {
  const { server, a } = await shopWithOwner();
  await server.db.batch([{ sql: 'UPDATE users SET token_version = token_version + 1' }]);

  a.sell([['P1', 2]]);
  await a.engine.syncNow();
  const refused = a.view();
  const requests = server.net.syncBodies.length;
  await a.engine.tick();
  const requestsAfterTick = server.net.syncBodies.length;
  await a.engine.signIn({ login: OWNER.login, password: OWNER.password });
  await a.engine.syncNow();

  expect(refused.mode).toBe('account');
  expect(refused.sync).toMatchObject({ status: 'auth', pending: 1 });
  expect(refused.data.products[0].quantity).toBe(38);
  expect(requestsAfterTick).toBe(requests);
  expect(a.view().sync).toMatchObject({ status: 'idle', pending: 0 });
  expect(await server.stock('P1')).toBe(38);
});

it('a server error is reported and the change is sent on the next try', async () => {
  const { server, a } = await shopWithOwner();
  const realBatch = server.db.batch;
  a.sell([['P1', 2]]);

  server.db.batch = async () => { throw new Error('database is busy'); };
  await a.engine.syncNow();
  const failed = a.view().sync;
  server.db.batch = realBatch;
  await a.engine.tick();

  expect(failed).toMatchObject({ status: 'error', pending: 1 });
  expect(failed.error).toMatch(/went wrong/i);
  expect(a.view().sync).toMatchObject({ status: 'idle', pending: 0, error: null });
  expect(await server.stock('P1')).toBe(38);
});

it('signing out keeps unsent changes and signing back in uploads them', async () => {
  const { server, a } = await shopWithOwner();
  server.net.online = false;
  a.sell([['P1', 2]]);
  await a.engine.syncNow();

  await a.engine.signOut();
  const signedOut = a.view();
  server.net.online = true;
  await a.engine.signIn({ login: OWNER.login, password: OWNER.password });
  await a.engine.syncNow();

  expect(signedOut.mode).toBe('local');
  expect(signedOut.account).toBe(null);
  expect(signedOut.sync.status).toBe('off');
  expect(a.sessionStore.get()).not.toBe(null);
  expect(await server.stock('P1')).toBe(38);
  expect(a.view().sync).toMatchObject({ status: 'idle', pending: 0 });
});

it('bill numbers continue after signing out and in', async () => {
  const { server, a } = await shopWithOwner();
  const first = a.sell([['P1', 1]]);
  const second = a.sell([['P1', 1]]);
  await a.engine.syncNow();

  await a.engine.signOut();
  await a.engine.signIn({ login: OWNER.login, password: OWNER.password });
  const third = a.sell([['P1', 1]]);
  await a.engine.syncNow();
  const afterThird = a.view().sync;
  // The same device after its browser data was cleared: only the server remembers the numbers.
  const wiped = makeDevice(server, { deviceId: a.deviceId });
  await wiped.engine.start();
  await wiped.engine.signIn({ login: OWNER.login, password: OWNER.password });
  await wiped.engine.syncNow();
  const fourth = wiped.sell([['P1', 1]]);

  expect(afterThird).toMatchObject({ status: 'idle', pending: 0, error: null });
  expect([first.billNo, second.billNo, third.billNo, fourth.billNo]).toEqual(['A1025', 'A1026', 'A1027', 'A1028']);
});

it('signing in on a device does not touch its local-mode data', async () => {
  const { server } = await shopWithOwner({ keepDeviceData: false });
  const b = makeDevice(server);
  await b.engine.start();
  b.sell([['P1', 5]]);

  await b.engine.signIn({ login: OWNER.login, password: OWNER.password });
  await b.engine.syncNow();
  const inAccount = b.data();
  await b.engine.signOut();

  expect(inAccount.products).toEqual([]);
  expect(b.stock('P1')).toBe(35);
  expect(b.data().bills.map((x) => x.id)).toEqual(['B1025']);
});

it('the session survives a restart, and a newer token from the server replaces the old one', async () => {
  const { server, a } = await shopWithOwner();
  const firstToken = a.sessionStore.get().token;

  server.clock.t += DAY + 1000;
  const again = a.reopen();
  await again.engine.start();
  await again.engine.syncNow();

  expect(again.view().mode).toBe('account');
  expect(again.sessionStore.get().token).not.toBe(firstToken);
  expect(again.view().sync.status).toBe('idle');
});

it('on an account, bills older than 60 days are not kept on the device', async () => {
  const { server, a } = await shopWithOwner();
  a.sell([['P1', 1]], T0 - 70 * DAY);
  const recent = a.sell([['P1', 1]], T0 - 10 * DAY);

  await a.engine.syncNow();
  const b = await secondDevice(server);

  expect(a.data().bills.map((x) => x.id)).toEqual([recent.id]);
  expect(b.data().bills.map((x) => x.id)).toEqual([recent.id]);
  expect(await server.count('bills')).toBe(2);
});

it('a renamed shop and other devices\' edits arrive on the next check', async () => {
  const { server, a } = await shopWithOwner();
  const b = await secondDevice(server);

  a.engine.dispatch('shop.update', { name: 'Lakshmi Kirana' });
  a.engine.dispatch('product.update', { productId: 'P1', patch: { price: 33 } });
  await a.engine.syncNow();
  await b.engine.tick();

  expect(b.data().shop.name).toBe('Lakshmi Kirana');
  expect(b.view().account.shop.name).toBe('Lakshmi Kirana');
  expect(b.data().products[0].price).toBe(33);
});

it('a confirmed sale stays on screen while older changes are still arriving', async () => {
  const { server, a } = await shopWithOwner();
  const b = await secondDevice(server);
  const oldBill = (n) => ({ id: `B${n}`, billNo: String(n), at: T0 - n * 1000, total: 30, payment: { method: 'cash' }, items: [{ productId: 'P1', name: 'Milk 500ml', qty: 1, price: 30, total: 30 }], seed: true });
  for (let page = 0; page < 12; page++) {
    a.engine.dispatch('import', { bills: Array.from({ length: 100 }, (_, i) => oldBill(page * 100 + i)) });
  }
  await a.engine.syncNow();

  const bill = b.sell([['P1', 1]]);
  const seen = [];
  b.engine.subscribe(() => seen.push(b.view()));
  await b.engine.syncNow();

  expect(seen.length).toBeGreaterThan(3);
  expect(seen.filter((snapshot) => !snapshot.data.bills.some((x) => x.id === bill.id))).toEqual([]);
  expect([...new Set(seen.map((snapshot) => snapshot.data.products[0].quantity))]).toEqual([39]);
  expect(b.data().bills).toHaveLength(1201);
  expect(b.view().sync).toMatchObject({ status: 'idle', pending: 0 });
});

it('signing in again after a failed save still sends the changes that were waiting', async () => {
  const server = makeServer();
  const storage = memoryStorage();
  const a = makeDevice(server, { storage });
  await a.engine.start();
  await a.engine.signUp({ ...OWNER, keepDeviceData: true });
  await a.engine.syncNow();
  await server.db.batch([{ sql: 'UPDATE users SET token_version = token_version + 1' }]);
  const realSave = storage.save;

  storage.save = async () => { throw new Error('The disk is full.'); };
  a.sell([['P1', 2]]);
  await a.engine.syncNow();
  await a.engine.settled();
  storage.save = realSave;
  await a.engine.signIn({ login: OWNER.login, password: OWNER.password });
  await a.engine.syncNow();

  expect(await server.stock('P1')).toBe(38);
  expect(a.view().sync).toMatchObject({ status: 'idle', pending: 0 });
  expect(a.view().saveError).toBe(null);
});

it('an answer that arrives after signing out is ignored', async () => {
  const { a } = await shopWithOwner();
  a.sell([['P1', 2]]);

  const syncing = a.engine.syncNow();
  await a.engine.signOut();
  await syncing;

  expect(a.view().mode).toBe('local');
  expect(a.view().sync.status).toBe('off');
  expect(a.stock('P1')).toBe(40);
});

/* ── saving ───────────────────────────────────────────────────── */

it('a failed save is reported, and cleared once saving works again', async () => {
  const server = makeServer();
  const storage = memoryStorage();
  const realSave = storage.save;
  const a = makeDevice(server, { storage });
  await a.engine.start();

  storage.save = async () => { throw new Error('The disk is full.'); };
  a.sell([['P1', 1]]);
  await a.engine.settled();
  const failed = a.view().saveError;
  storage.save = realSave;
  a.sell([['P1', 1]]);
  await a.engine.settled();

  expect(failed).toMatch(/disk is full/);
  expect(a.view().saveError).toBe(null);
  expect((await storage.load('local')).data.products[0].quantity).toBe(38);
});

it('says when the device can only keep data in memory', async () => {
  const server = makeServer();
  const a = makeDevice(server);
  await a.engine.start();

  expect(a.view().storage).toBe('memory');
});
