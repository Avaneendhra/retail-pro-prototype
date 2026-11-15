import test from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, call, T0 } from './helpers.js';
import { readConfig } from '../src/config.js';

test('health returns ok and the version', async () => {
  const { app } = makeApp();

  const res = await call(app, 'GET', '/api/health');

  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { ok: true, version: 'test', time: T0 });
});

test('unknown routes return a JSON 404', async () => {
  const { app } = makeApp();

  const res = await call(app, 'GET', '/api/nope');

  assert.equal(res.status, 404);
  assert.equal(res.json.error.code, 'not_found');
});

test('an unexpected failure returns a JSON 500 without leaking details', async () => {
  const { app, db } = makeApp();
  db.query = async () => { throw new Error('disk on fire at /secret/path'); };
  app.get('/api/boom', async (c) => { await c.get('ctx').db.query('SELECT 1'); return c.text('unreachable'); });

  const res = await call(app, 'GET', '/api/boom');

  assert.equal(res.status, 500);
  assert.deepEqual(res.json, { error: { code: 'server_error', message: 'Something went wrong. Please try again.' } });
});

test('config refuses a missing or short JWT_SECRET', () => {
  assert.throws(() => readConfig({}), /JWT_SECRET/);
  assert.throws(() => readConfig({ JWT_SECRET: 'short' }), /JWT_SECRET/);
});

test('config reads origins, signup code and version', () => {
  const config = readConfig({
    JWT_SECRET: 'x'.repeat(32),
    ALLOWED_ORIGINS: 'https://a.example, https://b.example ,',
    SIGNUP_CODE: 'open-sesame',
    APP_VERSION: '2.3.4',
  });

  assert.deepEqual(config.allowedOrigins, ['https://a.example', 'https://b.example']);
  assert.equal(config.signupCode, 'open-sesame');
  assert.equal(config.version, '2.3.4');
});
