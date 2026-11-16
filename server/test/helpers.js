// Test helpers: a real app on an in-memory SQLite database, with a clock the test controls.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { openNodeDb, migrate } from '../src/db/node.js';
import { normalizeLogin, deriveAuthKey } from '../../shared/auth.js';

export const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
export const T0 = Date.UTC(2026, 10, 16, 6, 0, 0);
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function makeApp(overrides = {}) {
  const db = openNodeDb(':memory:');
  migrate(db, MIGRATIONS);
  const clock = { t: T0, ip: '10.0.0.1' };
  const config = {
    jwtSecret: 'test-secret-test-secret-test-secret-1234',
    allowedOrigins: ['https://app.example'],
    signupCode: null,
    version: 'test',
    ...overrides,
  };
  const logs = [];
  const app = createApp(() => ({ db, config, now: () => clock.t, ip: clock.ip, log: (error) => logs.push(String(error?.stack || error)) }));
  return { app, db, config, clock, logs };
}

/** The key a browser would send for this login and password (few rounds: tests only). */
export const keyFor = (loginText, password) => deriveAuthKey(normalizeLogin(loginText), password, 1000);

let serial = 0;

/** Signs a new shop up. Returns the response body plus `status`, `authKey`, `login`, `password`. */
export async function signup(app, { login: loginText, shopName = 'Sri Lakshmi Stores', name = 'Lakshmi', password = 'correct horse', deviceId = 'device-a', signupCode } = {}) {
  loginText = loginText ?? `owner${++serial}@example.com`;
  const authKey = await keyFor(loginText, password);
  const res = await call(app, 'POST', '/api/auth/signup', { body: { shopName, name, login: loginText, authKey, deviceId, signupCode } });
  return { ...res.json, status: res.status, authKey, login: normalizeLogin(loginText), password };
}

export async function login(app, { login: loginText, password = 'correct horse', deviceId = 'device-a' }) {
  const res = await call(app, 'POST', '/api/auth/login', { body: { login: loginText, authKey: await keyFor(loginText, password), deviceId } });
  return { ...res.json, status: res.status };
}

export async function call(app, method, url, { body, token, headers } = {}) {
  const res = await app.request(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json, headers: res.headers };
}

/* ── sync helpers ─────────────────────────────────────────────── */

let opSerial = 0;
export const opId = () => `op-${++opSerial}`;

export const createProductOp = (fields = {}) => ({
  id: opId(), type: 'product.create', at: T0,
  product: { id: 'P1', name: 'Milk 500ml', code: 'ML', barcode: '8901262010016', category: 'dairy', price: 30, quantity: 40, min: 20, coverDays: 2, ...fields },
});

/** lines: [[productId, qty, price?], ...] */
export const saleOp = (lines, { billId, at = T0 } = {}) => {
  const n = ++opSerial;
  const items = lines.map(([productId, qty, price = 30]) => ({ productId, name: productId, qty, price, total: qty * price }));
  return {
    id: `op-${n}`, type: 'sale', at,
    bill: { id: billId ?? `BA${n}`, billNo: `A${n}`, at, total: items.reduce((sum, i) => sum + i.total, 0), payment: { method: 'cash' }, items },
  };
};

export async function sync(app, token, body = {}) {
  const res = await call(app, 'POST', '/api/sync', { token, body: { deviceId: 'device-a', since: 0, ...body } });
  return { ...res.json, status: res.status };
}

export async function stockOf(db, productId, shopId) {
  const rows = shopId
    ? await db.query('SELECT quantity FROM products WHERE id = ? AND shop_id = ?', [productId, shopId])
    : await db.query('SELECT quantity FROM products WHERE id = ?', [productId]);
  return rows[0]?.quantity;
}

/** A signed-up shop that already has Milk (P1, 40 in stock). */
export async function shopWithMilk(overrides) {
  const ctx = makeApp(overrides);
  const owner = await signup(ctx.app, { login: 'lakshmi@example.com' });
  await sync(ctx.app, owner.token, { ops: [createProductOp()] });
  return { ...ctx, owner };
}
