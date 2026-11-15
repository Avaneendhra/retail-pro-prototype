// Test helpers: a real app on an in-memory SQLite database, with a clock the test controls.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { openNodeDb, migrate } from '../src/db/node.js';

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
  const app = createApp(() => ({ db, config, now: () => clock.t, ip: clock.ip }));
  return { app, db, config, clock };
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
