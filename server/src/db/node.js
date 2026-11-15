// SQLite through Node's built-in driver. Used for local development, tests and
// self-hosting. Mirrors the Cloudflare D1 adapter: every write goes through batch().
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const returnsRows = (sql) => /^\s*(select|with|pragma)\b/i.test(sql) || /\breturning\b/i.test(sql);

export const bindable = (args = []) =>
  args.map(a => (a === undefined ? null : typeof a === 'boolean' ? (a ? 1 : 0) : a));

export function openNodeDb(file) {
  const raw = new DatabaseSync(file);
  if (file !== ':memory:') raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA busy_timeout = 5000');

  const prepared = new Map();
  const prepare = (sql) => {
    let statement = prepared.get(sql);
    if (!statement) {
      if (prepared.size > 500) prepared.clear();
      statement = raw.prepare(sql);
      prepared.set(sql, statement);
    }
    return statement;
  };

  const run = ({ sql, args }) => {
    const statement = prepare(sql);
    if (returnsRows(sql)) return { rows: statement.all(...bindable(args)), changes: 0 };
    const info = statement.run(...bindable(args));
    return { rows: [], changes: Number(info.changes) };
  };

  return {
    raw,
    /** Runs the statements in order inside one transaction: all succeed or none do. */
    async batch(statements) {
      if (!statements.length) return [];
      raw.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(run);
        raw.exec('COMMIT');
        return results;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
    async query(sql, args) {
      return run({ sql, args }).rows;
    },
    exec(sql) {
      raw.exec(sql);
    },
    close() {
      raw.close();
    },
  };
}

/** Applies each .sql file in `dir` once, in name order. Returns the names it applied. */
export function migrate(db, dir) {
  const { raw } = db;
  raw.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const done = new Set(raw.prepare('SELECT name FROM _migrations').all().map(r => r.name));
  const applied = [];
  for (const name of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue;
    raw.exec('BEGIN');
    try {
      raw.exec(fs.readFileSync(path.join(dir, name), 'utf8'));
      raw.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(name, Date.now());
      raw.exec('COMMIT');
    } catch (error) {
      raw.exec('ROLLBACK');
      throw error;
    }
    applied.push(name);
  }
  return applied;
}
