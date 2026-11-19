// Test helper: the Supabase database (supabase/migrations) in a real Postgres (PGlite), with a
// stand-in for Supabase's auth schema, and a fake Supabase client the app's code can use.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');
const T0 = Date.UTC(2026, 10, 16, 6);

export const AUTH_STUB = `
  create role anon; create role authenticated;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  grant execute on all functions in schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`;

export async function makeDb() {
  const db = new PGlite();
  await db.exec(AUTH_STUB);
  for (const f of fs.readdirSync(MIGRATIONS).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
  return db;
}

let serial = 0;
export const person = (fields = {}) => ({ sub: crypto.randomUUID(), role: 'authenticated', email: `u${++serial}@example.com`, ...fields });

/** Calls a function as `who` (claims) through the given database role, like PostgREST does. */
export async function call(db, who, fn, args = [], role = 'authenticated') {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [who ? JSON.stringify(who) : '']);
  await db.exec(`set role ${role}`);
  try {
    const params = args.map((_, i) => `$${i + 1}`).join(', ');
    const res = await db.query(`select public.${fn}(${params}) as r`, args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : a)));
    return res.rows[0].r;
  } finally {
    await db.exec('reset role');
  }
}


/**
 * A stand-in for the Supabase client: rpc() runs the database function as whoever `who()`
 * returns (null = signed out), and auth.getSession() reports whether someone is signed in.
 * Calls are queued, because PGlite runs one statement at a time.
 */
export function fakeSupabase(db, who) {
  let queue = Promise.resolve();
  return {
    rpc(fn, args = {}) {
      const run = queue.then(async () => {
        try {
          return { data: await call(db, who(), fn, Object.values(args), who() ? 'authenticated' : 'anon'), error: null };
        } catch (error) {
          return { data: null, error: { message: String(error.message).replace(/^error: /, ''), code: 'P0001' } };
        }
      });
      queue = run.catch(() => {});
      return run;
    },
    auth: { getSession: async () => ({ data: { session: who() ? { access_token: 'test' } : null } }) },
  };
}
