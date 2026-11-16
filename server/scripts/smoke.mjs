// Checks a running stokd server end to end, the way two devices would use it.
//   node server/scripts/smoke.mjs http://localhost:8787
// It creates one throw-away shop. Exit code 0 only if every step passes.
import { deriveAuthKey } from '../../shared/auth.js';

const base = (process.argv[2] || 'http://localhost:8787').replace(/\/+$/, '');
const stamp = Date.now();
const login = `smoke${stamp}@example.com`;
const password = `smoke-${stamp}`;

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

let failed = false;
function check(step, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${step}${ok ? '' : `  ${detail}`}`);
  if (!ok) failed = true;
}
const stockOf = (res) => res.json?.changes?.products?.find((p) => p.id === 'P1')?.quantity;

const health = await call('GET', '/api/health');
check('server answers', health.status === 200 && health.json?.ok === true, JSON.stringify(health));

const unknown = await call('GET', '/api/no-such-thing');
check('an unknown API address answers with a JSON error', unknown.status === 404 && unknown.json?.error?.code === 'not_found', JSON.stringify(unknown));

const authKey = await deriveAuthKey(login, password);
const signup = await call('POST', '/api/auth/signup', { body: { shopName: 'Smoke test shop', name: 'Smoke', login, authKey, deviceId: `smoke-a-${stamp}` } });
check('sign up', signup.status === 200 && Boolean(signup.json?.token), JSON.stringify(signup.json));
const a = signup.json?.token;

const product = { id: 'P1', name: 'Milk 500ml', code: 'ML', price: 30, quantity: 40, min: 20 };
const sale = {
  id: `sale-${stamp}`, type: 'sale', at: stamp,
  bill: { id: `BA${stamp}`, billNo: 'A1', at: stamp, total: 60, payment: { method: 'cash' }, items: [{ productId: 'P1', name: 'Milk 500ml', qty: 2, price: 30, total: 60 }] },
};
const first = await call('POST', '/api/sync', { token: a, body: { deviceId: `smoke-a-${stamp}`, since: 0, ops: [{ id: `create-${stamp}`, type: 'product.create', at: stamp, product }, sale] } });
check('device A adds a product and sells 2', first.status === 200 && first.json?.accepted?.length === 2 && stockOf(first) === 38, JSON.stringify(first.json));

const second = await call('POST', '/api/auth/login', { body: { login, authKey, deviceId: `smoke-b-${stamp}` } });
check('device B signs in as device 2', second.status === 200 && second.json?.device?.no === 2, JSON.stringify(second.json));
const b = second.json?.token;

const pull = await call('POST', '/api/sync', { token: b, body: { deviceId: `smoke-b-${stamp}`, since: 0, ops: [] } });
check('device B sees the sale and the stock', pull.json?.changes?.bills?.length === 1 && stockOf(pull) === 38, JSON.stringify(pull.json?.changes));

const again = await call('POST', '/api/sync', { token: a, body: { deviceId: `smoke-a-${stamp}`, since: 0, ops: [sale] } });
check('sending the same sale again does not count twice', again.status === 200 && stockOf(again) === 38 && again.json?.changes?.bills?.length === 1, JSON.stringify(again.json?.changes));

const wrong = await call('POST', '/api/auth/login', { body: { login, authKey: await deriveAuthKey(login, 'not the password'), deviceId: `smoke-c-${stamp}` } });
check('a wrong password is refused', wrong.status === 401, JSON.stringify(wrong));

console.log(failed ? '\nSomething is wrong with this server.' : `\nAll good: ${base} is working.`);
process.exit(failed ? 1 : 0);
