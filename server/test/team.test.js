import test from 'node:test';
import assert from 'node:assert/strict';
import { call, signup, login, sync, stockOf, shopWithMilk, saleOp, keyFor, T0 } from './helpers.js';

const RAVI = 'ravi@example.com';

async function addMember(app, token, { login: loginText = RAVI, name = 'Ravi', password = 'staff password' } = {}) {
  const res = await call(app, 'POST', '/api/team', { token, body: { name, login: loginText, authKey: await keyFor(loginText, password) } });
  return { status: res.status, ...res.json };
}
const patchMember = (app, token, id, body) => call(app, 'PATCH', `/api/team/${id}`, { token, body });
const staffLogin = (app, password = 'staff password') => login(app, { login: RAVI, password, deviceId: 'device-b' });

test('the owner adds a staff login and the staff member can sign in and sync', async () => {
  const { app, db, owner } = await shopWithMilk();

  const added = await addMember(app, owner.token);
  const staff = await staffLogin(app);
  const sale = await sync(app, staff.token, { deviceId: 'device-b', ops: [saleOp([['P1', 2]])] });
  const list = await call(app, 'GET', '/api/team', { token: owner.token });

  assert.equal(added.status, 200);
  assert.deepEqual({ ...added.member, id: 'x' }, { id: 'x', name: 'Ravi', login: RAVI, role: 'staff', disabled: false, createdAt: T0 });
  assert.equal(staff.status, 200);
  assert.equal(staff.user.role, 'staff');
  assert.equal(staff.shop.id, owner.shop.id);
  assert.equal(staff.device.no, 2);
  assert.equal(sale.accepted.length, 1);
  assert.equal(await stockOf(db, 'P1'), 38);
  assert.deepEqual(list.json.members.map((m) => [m.name, m.role]), [['Lakshmi', 'owner'], ['Ravi', 'staff']]);
});

test('staff cannot list, add or change team members', async () => {
  const { app, owner } = await shopWithMilk();
  const added = await addMember(app, owner.token);
  const staff = await staffLogin(app);

  const list = await call(app, 'GET', '/api/team', { token: staff.token });
  const add = await addMember(app, staff.token, { login: 'friend@example.com' });
  const promote = await patchMember(app, staff.token, added.member.id, { name: 'Boss' });

  assert.equal(list.status, 403);
  assert.equal(list.json.error.code, 'forbidden');
  assert.equal(add.status, 403);
  assert.equal(promote.status, 403);
});

test('team routes need a token', async () => {
  const { app } = await shopWithMilk();

  assert.equal((await call(app, 'GET', '/api/team')).status, 401);
  assert.equal((await call(app, 'POST', '/api/team', { body: {} })).status, 401);
});

test('disabling a staff member stops their token and their login; enabling brings the login back', async () => {
  const { app, owner } = await shopWithMilk();
  const { member } = await addMember(app, owner.token);
  const staff = await staffLogin(app);

  const disabled = await patchMember(app, owner.token, member.id, { disabled: true });
  const syncWhileDisabled = await sync(app, staff.token, { deviceId: 'device-b' });
  const loginWhileDisabled = await staffLogin(app);
  await patchMember(app, owner.token, member.id, { disabled: false });
  const loginAfter = await staffLogin(app);

  assert.equal(disabled.status, 200);
  assert.equal(disabled.json.member.disabled, true);
  assert.equal(syncWhileDisabled.status, 401);
  assert.equal(loginWhileDisabled.status, 401);
  assert.equal(loginAfter.status, 200);
});

test('the owner can reset a staff password', async () => {
  const { app, owner } = await shopWithMilk();
  const { member } = await addMember(app, owner.token);
  const staff = await staffLogin(app);

  const reset = await patchMember(app, owner.token, member.id, { authKey: await keyFor(RAVI, 'new staff password') });

  assert.equal(reset.status, 200);
  assert.equal((await staffLogin(app)).status, 401, 'the old password stops working');
  assert.equal((await staffLogin(app, 'new staff password')).status, 200);
  assert.equal((await sync(app, staff.token, { deviceId: 'device-b' })).status, 401, 'devices signed in with the old password are signed out');
});

test('a reset also clears a lockout from wrong guesses', async () => {
  const { app, owner } = await shopWithMilk();
  const { member } = await addMember(app, owner.token);
  for (let i = 0; i < 8; i++) await staffLogin(app, `guess ${i}`);
  const locked = await staffLogin(app);

  await patchMember(app, owner.token, member.id, { authKey: await keyFor(RAVI, 'new staff password') });

  assert.equal(locked.status, 429);
  assert.equal((await staffLogin(app, 'new staff password')).status, 200);
});

test('the owner can rename a team member', async () => {
  const { app, owner } = await shopWithMilk();
  const { member } = await addMember(app, owner.token);
  const staff = await staffLogin(app);

  const renamed = await patchMember(app, owner.token, member.id, { name: '  Ravi Kumar ' });

  assert.equal(renamed.json.member.name, 'Ravi Kumar');
  assert.equal((await sync(app, staff.token, { deviceId: 'device-b' })).user.name, 'Ravi Kumar', 'a rename does not sign anyone out');
});

test('the owner cannot disable or demote themselves', async () => {
  const { app, owner } = await shopWithMilk();

  const disable = await patchMember(app, owner.token, owner.user.id, { disabled: true });
  const resetOwn = await patchMember(app, owner.token, owner.user.id, { authKey: await keyFor('lakshmi@example.com', 'sneaky') });
  const demote = await patchMember(app, owner.token, owner.user.id, { role: 'staff' });
  const list = await call(app, 'GET', '/api/team', { token: owner.token });

  assert.equal(disable.status, 403);
  assert.equal(resetOwn.status, 403);
  assert.equal(demote.status, 400);
  assert.deepEqual(list.json.members.map((m) => [m.role, m.disabled]), [['owner', false]]);
});

test('a login already in use is refused', async () => {
  const { app, owner } = await shopWithMilk();
  await addMember(app, owner.token);

  const sameStaff = await addMember(app, owner.token, { login: ' RAVI@example.com' });
  const ownersLogin = await addMember(app, owner.token, { login: 'lakshmi@example.com' });

  assert.equal(sameStaff.status, 409);
  assert.equal(sameStaff.error.code, 'login_taken');
  assert.equal(ownersLogin.status, 409);
});

test('a member of another shop cannot be seen or changed', async () => {
  const { app, owner } = await shopWithMilk();
  const { member } = await addMember(app, owner.token);
  const other = await signup(app, { login: 'other@example.com', deviceId: 'device-z' });

  const change = await patchMember(app, other.token, member.id, { disabled: true });
  const list = await call(app, 'GET', '/api/team', { token: other.token });

  assert.equal(change.status, 404);
  assert.equal(list.json.members.length, 1);
  assert.equal((await staffLogin(app)).status, 200);
});

test('a shop can have at most 20 logins', async () => {
  const { app, owner } = await shopWithMilk();
  for (let i = 1; i < 20; i++) assert.equal((await addMember(app, owner.token, { login: `staff${i}@example.com` })).status, 200);

  const oneTooMany = await addMember(app, owner.token, { login: 'staff20@example.com' });

  assert.equal(oneTooMany.status, 409);
  assert.equal(oneTooMany.error.code, 'team_full');
});

test('a malformed team request is refused', async () => {
  const { app, owner } = await shopWithMilk();
  const { member } = await addMember(app, owner.token);

  assert.equal((await call(app, 'POST', '/api/team', { token: owner.token, body: { name: '', login: RAVI, authKey: 'x' } })).status, 400);
  assert.equal((await patchMember(app, owner.token, member.id, {})).status, 400);
  assert.equal((await patchMember(app, owner.token, member.id, { disabled: 'yes' })).status, 400);
});
