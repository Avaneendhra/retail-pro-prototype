import test from 'node:test';
import assert from 'node:assert/strict';
import { openNodeDb, migrate } from '../src/db/node.js';
import { MIGRATIONS } from './helpers.js';

const scratch = () => {
  const db = openNodeDb(':memory:');
  db.exec('CREATE TABLE t (id TEXT PRIMARY KEY, note TEXT, n INTEGER)');
  return db;
};

test('a failing statement rolls the whole batch back', async () => {
  const db = scratch();

  await assert.rejects(db.batch([
    { sql: 'INSERT INTO t (id) VALUES (?)', args: ['a'] },
    { sql: 'INSERT INTO t (id) VALUES (?)', args: ['a'] }, // primary key clash
  ]));

  assert.deepEqual(await db.query('SELECT id FROM t'), []);
});

test('a batch returns rows for reads and change counts for writes, in order', async () => {
  const db = scratch();

  const [insert, update, select] = await db.batch([
    { sql: 'INSERT INTO t (id, n) VALUES (?, ?), (?, ?)', args: ['a', 1, 'b', 2] },
    { sql: 'UPDATE t SET n = n + 10 WHERE id = ?', args: ['b'] },
    { sql: 'SELECT id, n FROM t ORDER BY id' },
  ]);

  assert.equal(insert.changes, 2);
  assert.equal(update.changes, 1);
  assert.deepEqual(select.rows.map(r => ({ ...r })), [{ id: 'a', n: 1 }, { id: 'b', n: 12 }]);
});

test('a later statement in a batch sees what an earlier one wrote', async () => {
  const db = scratch();

  const [, guarded] = await db.batch([
    { sql: 'INSERT INTO t (id, n) VALUES (?, ?)', args: ['a', 1] },
    { sql: 'UPDATE t SET n = 99 WHERE id = ? AND EXISTS (SELECT 1 FROM t WHERE id = ? AND n = 1)', args: ['a', 'a'] },
  ]);

  assert.equal(guarded.changes, 1);
});

test('undefined arguments are stored as NULL and booleans as 0 or 1', async () => {
  const db = scratch();

  await db.batch([{ sql: 'INSERT INTO t (id, note, n) VALUES (?, ?, ?)', args: ['a', undefined, true] }]);

  const [row] = await db.query('SELECT note, n FROM t');
  assert.equal(row.note, null);
  assert.equal(row.n, 1);
});

test('migrate applies each file once', () => {
  const db = openNodeDb(':memory:');

  const first = migrate(db, MIGRATIONS);
  const second = migrate(db, MIGRATIONS);

  assert.deepEqual(first, ['0001_init.sql', '0002_bill_discount.sql', '0003_product_dates.sql']);
  assert.deepEqual(second, []);
});

test('the schema has every table the app needs', async () => {
  const db = openNodeDb(':memory:');
  migrate(db, MIGRATIONS);

  const tables = (await db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' ORDER BY name")).map(r => r.name);

  assert.deepEqual(tables, ['auth_attempts', 'bills', 'devices', 'invoices', 'ops', 'products', 'purchase_orders', 'shops', 'users']);
});
