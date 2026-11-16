import test from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, call, signup, login, keyFor, MINUTE, HOUR, DAY } from './helpers.js';

const probe = (app, token) => call(app, 'POST', '/api/auth/password', { token, body: {} });

test('signup creates a shop, an owner and device 1', async () => {
  const { app, db } = makeApp();

  const res = await signup(app, { login: 'Lakshmi@Example.com', shopName: 'Sri Lakshmi Stores', name: 'Lakshmi' });

  assert.equal(res.status, 200);
  assert.deepEqual({ name: res.user.name, login: res.user.login, role: res.user.role }, { name: 'Lakshmi', login: 'lakshmi@example.com', role: 'owner' });
  assert.equal(res.shop.name, 'Sri Lakshmi Stores');
  assert.deepEqual(res.device, { id: 'device-a', no: 1, counters: {} });
  assert.match(res.token, /^[\w-]+\.[\w-]+\.[\w-]+$/);
  const [row] = await db.query('SELECT pass_hash FROM users');
  assert.notEqual(row.pass_hash, res.authKey, 'the key must not be stored as it was sent');
});

test('the recovery code looks like XXXX-XXXX-XXXX-XXXX', async () => {
  const { app } = makeApp();

  const res = await signup(app);

  assert.match(res.recoveryCode, /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
});

test('a second signup with the same login is refused', async () => {
  const { app } = makeApp();
  await signup(app, { login: 'lakshmi@example.com' });

  const res = await signup(app, { login: ' LAKSHMI@example.com ', deviceId: 'device-b' });

  assert.equal(res.status, 409);
  assert.equal(res.error.code, 'login_taken');
});

test('login with the right key returns a token, the user, the shop and the device', async () => {
  const { app } = makeApp();
  const owner = await signup(app, { login: '98765 43210', shopName: 'Corner Shop' });

  const res = await login(app, { login: '+91 9876543210' });

  assert.equal(res.status, 200);
  assert.equal(res.user.id, owner.user.id);
  assert.equal(res.shop.name, 'Corner Shop');
  assert.equal(res.device.no, 1);
  assert.ok(res.token);
});

test('login with a wrong key or an unknown login is refused the same way', async () => {
  const { app } = makeApp();
  await signup(app, { login: 'lakshmi@example.com' });

  const wrong = await login(app, { login: 'lakshmi@example.com', password: 'wrong horse' });
  const unknown = await login(app, { login: 'nobody@example.com' });

  assert.equal(wrong.status, 401);
  assert.equal(wrong.error.code, 'bad_credentials');
  assert.equal(unknown.status, 401);
  assert.deepEqual(unknown.error, wrong.error);
});

test('the 9th failed login in 15 minutes is refused even with the right key, and works again later', async () => {
  const { app, clock } = makeApp();
  await signup(app, { login: 'lakshmi@example.com' });
  for (let i = 0; i < 8; i++) await login(app, { login: 'lakshmi@example.com', password: `guess ${i}` });

  const locked = await login(app, { login: 'lakshmi@example.com' });
  clock.t += 15 * MINUTE + 1;
  const later = await login(app, { login: 'lakshmi@example.com' });

  assert.equal(locked.status, 429);
  assert.equal(locked.error.code, 'too_many_attempts');
  assert.equal(later.status, 200);
});

test('a successful login clears earlier failures', async () => {
  const { app } = makeApp();
  await signup(app, { login: 'lakshmi@example.com' });
  for (let i = 0; i < 7; i++) await login(app, { login: 'lakshmi@example.com', password: `guess ${i}` });
  await login(app, { login: 'lakshmi@example.com' });
  for (let i = 0; i < 7; i++) await login(app, { login: 'lakshmi@example.com', password: `guess ${i}` });

  const res = await login(app, { login: 'lakshmi@example.com' });

  assert.equal(res.status, 200);
});

test('the 6th signup from one address in an hour is refused; other addresses and later hours are fine', async () => {
  const { app, clock } = makeApp();
  for (let i = 0; i < 5; i++) assert.equal((await signup(app)).status, 200);

  const sixth = await signup(app);
  clock.ip = '10.0.0.2';
  const otherAddress = await signup(app);
  clock.ip = '10.0.0.1';
  clock.t += HOUR + 1;
  const nextHour = await signup(app);

  assert.equal(sixth.status, 429);
  assert.equal(sixth.error.code, 'too_many_attempts');
  assert.equal(otherAddress.status, 200);
  assert.equal(nextHour.status, 200);
});

test('recover sets a new password and returns a new code; the old code, password and token stop working', async () => {
  const { app } = makeApp();
  const owner = await signup(app, { login: 'lakshmi@example.com' });

  const res = await call(app, 'POST', '/api/auth/recover', {
    body: { login: 'lakshmi@example.com', recoveryCode: owner.recoveryCode.toLowerCase(), authKey: await keyFor('lakshmi@example.com', 'new password') },
  });
  const reuse = await call(app, 'POST', '/api/auth/recover', {
    body: { login: 'lakshmi@example.com', recoveryCode: owner.recoveryCode, authKey: await keyFor('lakshmi@example.com', 'another') },
  });

  assert.equal(res.status, 200);
  assert.match(res.json.recoveryCode, /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
  assert.notEqual(res.json.recoveryCode, owner.recoveryCode);
  assert.equal(reuse.status, 401);
  assert.equal((await login(app, { login: 'lakshmi@example.com', password: 'new password' })).status, 200);
  assert.equal((await login(app, { login: 'lakshmi@example.com' })).status, 401);
  assert.equal((await probe(app, owner.token)).status, 401);
});

test('changing the password needs the current one and signs other tokens out', async () => {
  const { app } = makeApp();
  const owner = await signup(app, { login: 'lakshmi@example.com' });
  const next = await keyFor('lakshmi@example.com', 'new password');

  const wrongCurrent = await call(app, 'POST', '/api/auth/password', { token: owner.token, body: { currentAuthKey: next, authKey: next } });
  const changed = await call(app, 'POST', '/api/auth/password', { token: owner.token, body: { currentAuthKey: owner.authKey, authKey: next } });

  assert.equal(wrongCurrent.status, 401);
  assert.equal(wrongCurrent.json.error.code, 'bad_credentials');
  assert.equal(changed.status, 200);
  assert.equal((await probe(app, owner.token)).status, 401, 'old token is signed out');
  assert.equal((await probe(app, changed.json.token)).status, 400, 'new token is accepted (then fails validation)');
  assert.equal((await login(app, { login: 'lakshmi@example.com', password: 'new password' })).status, 200);
});

test('signup is refused without the code when sign-ups are closed', async () => {
  const { app } = makeApp({ signupCode: 'pilot-2026' });

  const without = await signup(app);
  const withCode = await signup(app, { signupCode: 'pilot-2026' });

  assert.equal(without.status, 403);
  assert.equal(without.error.code, 'signup_closed');
  assert.equal(withCode.status, 200);
});

test('a malformed body is refused', async () => {
  const { app } = makeApp();
  const authKey = await keyFor('lakshmi@example.com', 'correct horse');
  const good = { shopName: 'Shop', name: 'Lakshmi', login: 'lakshmi@example.com', authKey, deviceId: 'device-a' };

  const cases = {
    'not JSON': '{nope',
    'missing shop name': { ...good, shopName: '' },
    'login is neither phone nor email': { ...good, login: 'lakshmi' },
    'key too short': { ...good, authKey: 'abc' },
    'missing device': { ...good, deviceId: undefined },
  };

  for (const [label, body] of Object.entries(cases)) {
    const res = await call(app, 'POST', '/api/auth/signup', { body });
    assert.equal(res.status, 400, label);
    assert.equal(res.json.error.code, 'invalid_input', label);
  }
});

test('a token stops working after 60 days', async () => {
  const { app, clock } = makeApp();
  const owner = await signup(app);

  clock.t += 59 * DAY;
  const stillGood = await probe(app, owner.token);
  clock.t += 2 * DAY;
  const expired = await probe(app, owner.token);

  assert.equal(stillGood.status, 400);
  assert.equal(expired.status, 401);
  assert.equal(expired.json.error.code, 'unauthorized');
});

test('requests without a token, or with a forged one, are refused', async () => {
  const { app } = makeApp();
  const owner = await signup(app);
  const forged = owner.token.slice(0, -3) + (owner.token.endsWith('AAA') ? 'BBB' : 'AAA');

  assert.equal((await probe(app, undefined)).status, 401);
  assert.equal((await probe(app, forged)).status, 401);
});

test('a second device logging in gets device 2, and keeps it', async () => {
  const { app } = makeApp();
  await signup(app, { login: 'lakshmi@example.com', deviceId: 'device-a' });

  const second = await login(app, { login: 'lakshmi@example.com', deviceId: 'device-b' });
  const again = await login(app, { login: 'lakshmi@example.com', deviceId: 'device-b' });
  const first = await login(app, { login: 'lakshmi@example.com', deviceId: 'device-a' });

  assert.equal(second.device.no, 2);
  assert.equal(again.device.no, 2);
  assert.equal(first.device.no, 1);
});

test('a disabled user cannot log in and their token stops working', async () => {
  const { app, db } = makeApp();
  const owner = await signup(app, { login: 'lakshmi@example.com' });
  await db.batch([{ sql: 'UPDATE users SET disabled = 1 WHERE id = ?', args: [owner.user.id] }]);

  assert.equal((await login(app, { login: 'lakshmi@example.com' })).status, 401);
  assert.equal((await probe(app, owner.token)).status, 401);
});

test('sign-up attempts for a login that is taken also count toward the hourly limit', async () => {
  const { app } = makeApp();
  await signup(app, { login: 'lakshmi@example.com' });
  for (let i = 0; i < 4; i++) await signup(app, { login: 'lakshmi@example.com' });

  const res = await signup(app, { login: 'someone-new@example.com' });

  assert.equal(res.status, 429);
});
