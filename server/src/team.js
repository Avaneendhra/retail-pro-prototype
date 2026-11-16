// The shop's logins. Only the owner can list, add, rename, disable or reset them.
import { z } from 'zod';
import { requireUser, readBody, hashAuthKey, loginField, authKeyField } from './auth.js';
import { fail } from './errors.js';

export const MAX_MEMBERS = 20;

const nameField = z.string().trim().min(1).max(60);
const AddBody = z.object({ name: nameField, login: loginField, authKey: authKeyField });
const PatchBody = z.object({ name: nameField, disabled: z.boolean(), authKey: authKeyField })
  .partial()
  .refine((body) => Object.values(body).some((value) => value !== undefined), { message: 'Nothing to change.' });

const COLUMNS = 'id, name, login, role, disabled, created_at';
const member = (row) => ({
  id: row.id, name: row.name, login: row.login, role: row.role, disabled: Boolean(row.disabled), createdAt: row.created_at,
});

async function requireOwner(c, next) {
  if (c.get('user').role !== 'owner') throw fail(403, 'forbidden', 'Only the shop owner can manage logins.');
  await next();
}

export function teamRoutes(app) {
  app.get('/api/team', requireUser, requireOwner, async (c) => {
    const { db } = c.get('ctx');
    const rows = await db.query(
      `SELECT ${COLUMNS} FROM users WHERE shop_id = ? ORDER BY role = 'owner' DESC, created_at, id`,
      [c.get('user').shopId],
    );
    return c.json({ members: rows.map(member) });
  });

  app.post('/api/team', requireUser, requireOwner, async (c) => {
    const { db, now } = c.get('ctx');
    const { shopId } = c.get('user');
    const body = await readBody(c, AddBody);
    const id = `u_${crypto.randomUUID()}`;
    const { salt, hash } = await hashAuthKey(body.authKey);

    let results;
    try {
      results = await db.batch([
        {
          sql: `INSERT INTO users (id, shop_id, login, name, role, pass_salt, pass_hash, created_at)
                SELECT ?1, ?2, ?3, ?4, 'staff', ?5, ?6, ?7
                WHERE (SELECT COUNT(*) FROM users WHERE shop_id = ?2) < ${MAX_MEMBERS}`,
          args: [id, shopId, body.login, body.name, salt, hash, now()],
        },
        { sql: `SELECT ${COLUMNS} FROM users WHERE id = ?1`, args: [id] },
      ]);
    } catch (error) {
      if (/unique/i.test(String(error?.message))) {
        throw fail(409, 'login_taken', 'An account with this phone number or email already exists.');
      }
      throw error;
    }

    const [row] = results[1].rows;
    if (!row) throw fail(409, 'team_full', `A shop can have up to ${MAX_MEMBERS} logins.`);
    return c.json({ member: member(row) });
  });

  app.patch('/api/team/:id', requireUser, requireOwner, async (c) => {
    const { db } = c.get('ctx');
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await readBody(c, PatchBody);
    const signsOut = body.disabled !== undefined || body.authKey !== undefined;
    if (id === user.id && signsOut) {
      throw fail(403, 'forbidden', 'You cannot disable your own login here. To change your password, use Change password.');
    }

    const args = [id, user.shopId];
    const sets = [];
    const set = (column, value) => {
      args.push(value);
      sets.push(`${column} = ?${args.length}`);
    };
    if (body.name !== undefined) set('name', body.name);
    if (body.disabled !== undefined) set('disabled', body.disabled ? 1 : 0);
    if (body.authKey !== undefined) {
      const { salt, hash } = await hashAuthKey(body.authKey);
      set('pass_salt', salt);
      set('pass_hash', hash);
    }
    if (signsOut) sets.push('token_version = token_version + 1'); // every device of that login must sign in again

    const mine = 'WHERE id = ?1 AND shop_id = ?2';
    const results = await db.batch([
      { sql: `UPDATE users SET ${sets.join(', ')} ${mine}`, args },
      ...(body.authKey !== undefined
        ? [{ sql: `DELETE FROM auth_attempts WHERE key = (SELECT 'login:' || login FROM users ${mine})`, args: [id, user.shopId] }]
        : []),
      { sql: `SELECT ${COLUMNS} FROM users ${mine}`, args: [id, user.shopId] },
    ]);

    const [row] = results.at(-1).rows;
    if (!row) throw fail(404, 'not_found', 'There is no such login in this shop.');
    return c.json({ member: member(row) });
  });
}
