// Accounts: sign-up, login, recovery, password change, and the token check.
import { sign, verify } from 'hono/jwt';
import { z } from 'zod';
import { normalizeLogin, toBase64Url } from '../../shared/auth.js';
import { fail } from './errors.js';

const TOKEN_DAYS = 60;
const LOGIN_WINDOW_MS = 15 * 60_000;
const MAX_LOGIN_FAILURES = 8;
const SIGNUP_WINDOW_MS = 60 * 60_000;
const MAX_SIGNUPS_PER_IP = 5;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0 or 1

/* ── small crypto helpers ─────────────────────────────────────── */

const fromBase64Url = (text) => {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

const sha256 = async (bytes) => toBase64Url(await crypto.subtle.digest('SHA-256', bytes));

const sameText = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

export async function hashAuthKey(authKey, salt = toBase64Url(randomBytes(16))) {
  const saltBytes = fromBase64Url(salt);
  const keyBytes = fromBase64Url(authKey);
  const joined = new Uint8Array(saltBytes.length + keyBytes.length);
  joined.set(saltBytes);
  joined.set(keyBytes, saltBytes.length);
  return { salt, hash: await sha256(joined) };
}

export async function verifyAuthKey(authKey, salt, hash) {
  return sameText((await hashAuthKey(authKey, salt)).hash, hash);
}

function newRecoveryCode() {
  const chars = Array.from(randomBytes(16), (byte) => CODE_ALPHABET[byte & 31]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

const hashRecoveryCode = (code) =>
  sha256(new TextEncoder().encode(String(code).toUpperCase().replace(/[^A-Z0-9]/g, '')));

/* ── tokens ───────────────────────────────────────────────────── */

export async function signToken({ userId, shopId, tokenVersion }, secret, now) {
  const iat = Math.floor(now / 1000);
  return sign({ sub: userId, shop: shopId, tv: tokenVersion, iat, exp: iat + TOKEN_DAYS * 86_400 }, secret, 'HS256');
}

/** Returns the token's claims, or null if it is forged, malformed or expired. */
export async function readToken(token, secret, now) {
  try {
    // Expiry is checked against the injected clock, not the library's.
    const claims = await verify(token, secret, { alg: 'HS256', exp: false, nbf: false, iat: false });
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null;
    return { userId: claims.sub, shopId: claims.shop, tokenVersion: claims.tv, iat: claims.iat };
  } catch {
    return null;
  }
}

/* ── request helpers ──────────────────────────────────────────── */

export async function readBody(c, schema) {
  let raw;
  try {
    raw = await c.req.json();
  } catch {
    throw fail(400, 'invalid_input', 'The request could not be read.');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw fail(400, 'invalid_input', `${issue.path.join('.') || 'body'}: ${issue.message}`);
  }
  return parsed.data;
}

const loginField = z.string().max(254).transform((value, ctx) => {
  const login = normalizeLogin(value);
  if (!login) {
    ctx.addIssue({ code: 'custom', message: 'Enter a phone number or an email address.' });
    return z.NEVER;
  }
  return login;
});
const authKeyField = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid key.');
export const deviceIdField = z.string().min(8).max(64).regex(/^[\w-]+$/);
const deviceNameField = z.string().max(80).optional();

const SignupBody = z.object({
  shopName: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(60),
  login: loginField,
  authKey: authKeyField,
  deviceId: deviceIdField,
  deviceName: deviceNameField,
  signupCode: z.string().max(100).nullish(),
});
const LoginBody = z.object({ login: loginField, authKey: authKeyField, deviceId: deviceIdField, deviceName: deviceNameField });
const RecoverBody = z.object({ login: loginField, recoveryCode: z.string().min(16).max(40), authKey: authKeyField });
const PasswordBody = z.object({ currentAuthKey: authKeyField, authKey: authKeyField });

const publicUser = (row) => ({ id: row.id, name: row.name, login: row.login, role: row.role });

const parseJson = (text, fallback) => {
  try { return JSON.parse(text); } catch { return fallback; }
};

export const publicDevice = (row) => ({ id: row.id, no: row.device_no, counters: parseJson(row.counters, {}) });

/** Statements that register a device (first time) and return its row last. */
export function deviceStatements(shopId, deviceId, deviceName, now) {
  return [
    {
      sql: `INSERT INTO devices (shop_id, id, device_no, name, counters, last_seen)
            SELECT ?1, ?2, COALESCE((SELECT MAX(device_no) FROM devices WHERE shop_id = ?1), 0) + 1, ?3, '{}', ?4
            WHERE NOT EXISTS (SELECT 1 FROM devices WHERE shop_id = ?1 AND id = ?2)`,
      args: [shopId, deviceId, deviceName || '', now],
    },
    { sql: 'SELECT id, device_no, counters FROM devices WHERE shop_id = ?1 AND id = ?2', args: [shopId, deviceId] },
  ];
}

async function attemptsSince(db, key, since) {
  const [row] = await db.query('SELECT COUNT(*) AS n FROM auth_attempts WHERE key = ? AND at > ?', [key, since]);
  return row.n;
}

const recordAttempt = (key, now) => ({ sql: 'INSERT INTO auth_attempts (key, at) VALUES (?, ?)', args: [key, now] });

async function refuseIfLockedOut(db, login, now) {
  if (await attemptsSince(db, `login:${login}`, now - LOGIN_WINDOW_MS) >= MAX_LOGIN_FAILURES) {
    throw fail(429, 'too_many_attempts', 'Too many attempts. Wait 15 minutes and try again.');
  }
}

const badCredentials = () => fail(401, 'bad_credentials', 'That login and password do not match.');

/* ── middleware ───────────────────────────────────────────────── */

/** Requires a valid bearer token and loads the user into `c.get('user')`. */
export async function requireUser(c, next) {
  const { db, config, now } = c.get('ctx');
  const header = c.req.header('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const claims = token ? await readToken(token, config.jwtSecret, now()) : null;
  const unauthorized = () => fail(401, 'unauthorized', 'Please sign in again.');
  if (!claims) throw unauthorized();

  const [row] = await db.query(
    'SELECT id, shop_id, login, name, role, token_version, disabled FROM users WHERE id = ?',
    [claims.userId],
  );
  if (!row || row.disabled || row.token_version !== claims.tokenVersion || row.shop_id !== claims.shopId) throw unauthorized();

  c.set('user', { id: row.id, shopId: row.shop_id, login: row.login, name: row.name, role: row.role, tokenVersion: row.token_version });
  c.set('tokenIssuedAt', claims.iat * 1000);
  await next();
}

/* ── routes ───────────────────────────────────────────────────── */

export function authRoutes(app) {
  app.post('/api/auth/signup', async (c) => {
    const { db, config, now, ip } = c.get('ctx');
    const body = await readBody(c, SignupBody);
    const at = now();

    if (config.signupCode && body.signupCode !== config.signupCode) {
      throw fail(403, 'signup_closed', 'Sign-ups are closed. Ask for an invite code.');
    }
    const ipKey = `signup:${ip}`;
    if (await attemptsSince(db, ipKey, at - SIGNUP_WINDOW_MS) >= MAX_SIGNUPS_PER_IP) {
      throw fail(429, 'too_many_attempts', 'Too many new accounts from this network. Try again in an hour.');
    }
    const taken = () => fail(409, 'login_taken', 'An account with this phone number or email already exists.');
    if ((await db.query('SELECT 1 AS x FROM users WHERE login = ?', [body.login])).length) {
      await db.batch([recordAttempt(ipKey, at)]); // probing for existing logins is limited too
      throw taken();
    }

    const shopId = `s_${crypto.randomUUID()}`;
    const userId = `u_${crypto.randomUUID()}`;
    const { salt, hash } = await hashAuthKey(body.authKey);
    const recoveryCode = newRecoveryCode();

    let results;
    try {
      results = await db.batch([
        { sql: 'INSERT INTO shops (id, name, seq, created_at) VALUES (?, ?, 0, ?)', args: [shopId, body.shopName, at] },
        {
          sql: `INSERT INTO users (id, shop_id, login, name, role, pass_salt, pass_hash, recovery_hash, created_at)
                VALUES (?, ?, ?, ?, 'owner', ?, ?, ?, ?)`,
          args: [userId, shopId, body.login, body.name, salt, hash, await hashRecoveryCode(recoveryCode), at],
        },
        recordAttempt(ipKey, at),
        ...deviceStatements(shopId, body.deviceId, body.deviceName, at),
      ]);
    } catch (error) {
      if (/unique/i.test(String(error?.message))) throw taken(); // two sign-ups raced for one login
      throw error;
    }

    const user = { id: userId, name: body.name, login: body.login, role: 'owner' };
    return c.json({
      token: await signToken({ userId, shopId, tokenVersion: 0 }, config.jwtSecret, at),
      user,
      shop: { id: shopId, name: body.shopName },
      device: publicDevice(results.at(-1).rows[0]),
      recoveryCode,
    });
  });

  app.post('/api/auth/login', async (c) => {
    const { db, config, now } = c.get('ctx');
    const body = await readBody(c, LoginBody);
    const at = now();
    await refuseIfLockedOut(db, body.login, at);

    const [row] = await db.query(
      `SELECT u.id, u.shop_id, u.login, u.name, u.role, u.pass_salt, u.pass_hash, u.token_version, u.disabled, s.name AS shop_name
       FROM users u JOIN shops s ON s.id = u.shop_id WHERE u.login = ?`,
      [body.login],
    );
    const ok = row && !row.disabled && await verifyAuthKey(body.authKey, row.pass_salt, row.pass_hash);
    if (!ok) {
      await db.batch([recordAttempt(`login:${body.login}`, at)]);
      throw badCredentials();
    }

    const results = await db.batch([
      { sql: 'DELETE FROM auth_attempts WHERE key = ? OR at < ?', args: [`login:${body.login}`, at - SIGNUP_WINDOW_MS] },
      ...deviceStatements(row.shop_id, body.deviceId, body.deviceName, at),
    ]);

    return c.json({
      token: await signToken({ userId: row.id, shopId: row.shop_id, tokenVersion: row.token_version }, config.jwtSecret, at),
      user: publicUser(row),
      shop: { id: row.shop_id, name: row.shop_name },
      device: publicDevice(results.at(-1).rows[0]),
    });
  });

  app.post('/api/auth/recover', async (c) => {
    const { db, now } = c.get('ctx');
    const body = await readBody(c, RecoverBody);
    const at = now();
    await refuseIfLockedOut(db, body.login, at);

    const [row] = await db.query('SELECT id, recovery_hash, disabled FROM users WHERE login = ?', [body.login]);
    const ok = row && !row.disabled && row.recovery_hash && sameText(await hashRecoveryCode(body.recoveryCode), row.recovery_hash);
    if (!ok) {
      await db.batch([recordAttempt(`login:${body.login}`, at)]);
      throw fail(401, 'bad_credentials', 'That recovery code is not right.');
    }

    const { salt, hash } = await hashAuthKey(body.authKey);
    const recoveryCode = newRecoveryCode();
    await db.batch([
      {
        sql: 'UPDATE users SET pass_salt = ?, pass_hash = ?, recovery_hash = ?, token_version = token_version + 1 WHERE id = ?',
        args: [salt, hash, await hashRecoveryCode(recoveryCode), row.id],
      },
      { sql: 'DELETE FROM auth_attempts WHERE key = ?', args: [`login:${body.login}`] },
    ]);
    return c.json({ ok: true, recoveryCode });
  });

  app.post('/api/auth/password', requireUser, async (c) => {
    const { db, config, now } = c.get('ctx');
    const user = c.get('user');
    const body = await readBody(c, PasswordBody);

    const [row] = await db.query('SELECT pass_salt, pass_hash FROM users WHERE id = ?', [user.id]);
    if (!(await verifyAuthKey(body.currentAuthKey, row.pass_salt, row.pass_hash))) throw badCredentials();

    const { salt, hash } = await hashAuthKey(body.authKey);
    await db.batch([
      { sql: 'UPDATE users SET pass_salt = ?, pass_hash = ?, token_version = token_version + 1 WHERE id = ?', args: [salt, hash, user.id] },
    ]);
    const token = await signToken({ userId: user.id, shopId: user.shopId, tokenVersion: user.tokenVersion + 1 }, config.jwtSecret, now());
    return c.json({ ok: true, token });
  });
}
