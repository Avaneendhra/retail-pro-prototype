import test from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, call, signup } from './helpers.js';

const ALLOWED = 'https://app.example';

test('preflight from an allowed origin is answered with that origin', async () => {
  const { app } = makeApp();

  const res = await call(app, 'OPTIONS', '/api/sync', {
    headers: { origin: ALLOWED, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' },
  });

  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), ALLOWED);
  assert.match(res.headers.get('access-control-allow-methods'), /POST/);
  assert.match(res.headers.get('access-control-allow-headers'), /authorization/i);
});

test('a request from an allowed origin gets the CORS header', async () => {
  const { app } = makeApp();

  const res = await call(app, 'GET', '/api/health', { headers: { origin: ALLOWED } });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), ALLOWED);
  assert.match(res.headers.get('vary') || '', /origin/i);
});

test('a request from another origin gets no CORS header', async () => {
  const { app } = makeApp();

  const res = await call(app, 'GET', '/api/health', { headers: { origin: 'https://evil.example' } });
  const preflight = await call(app, 'OPTIONS', '/api/sync', { headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });

  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(preflight.headers.get('access-control-allow-origin'), null);
});

test('errors from an allowed origin are readable by the app too', async () => {
  const { app } = makeApp();

  const res = await call(app, 'POST', '/api/sync', { headers: { origin: ALLOWED }, body: { deviceId: 'device-a' } });

  assert.equal(res.status, 401);
  assert.equal(res.headers.get('access-control-allow-origin'), ALLOWED);
});

test('a body over 1 MB is refused', async () => {
  const { app } = makeApp();
  const owner = await signup(app);
  const big = JSON.stringify({ deviceId: 'device-a', ops: [], padding: 'x'.repeat(1024 * 1024) });
  const justUnder = JSON.stringify({ deviceId: 'device-a', ops: [], padding: 'x'.repeat(1024 * 1024 - 200) });

  const streamed = await call(app, 'POST', '/api/sync', { token: owner.token, body: big });
  const declared = await call(app, 'POST', '/api/sync', { token: owner.token, body: big, headers: { 'content-length': String(big.length) } });
  const ok = await call(app, 'POST', '/api/sync', { token: owner.token, body: justUnder });

  assert.equal(streamed.status, 413);
  assert.equal(streamed.json.error.code, 'too_large');
  assert.equal(declared.status, 413);
  assert.equal(declared.json.error.code, 'too_large');
  assert.equal(ok.status, 200);
});
