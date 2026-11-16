// Runs stokd on any computer with Node: the API, the database file and the built app, on one port.
//   node server/src/node.js
// Settings (all optional): PORT, DATABASE_PATH, JWT_SECRET, ALLOWED_ORIGINS, SIGNUP_CODE.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { migrate, openNodeDb } from './db/node.js';

const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(serverDir, 'data');
const publicDir = path.join(serverDir, 'public');
const port = Number(process.env.PORT) || 8787;
const databasePath = process.env.DATABASE_PATH || path.join(dataDir, 'stokd.db');

/** Without JWT_SECRET, one is made on first run and kept beside the database, so sign-ins survive restarts. */
function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(dataDir, 'secret');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(file, 'utf8').trim();
}

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const db = openNodeDb(databasePath);
const applied = migrate(db, path.join(serverDir, 'migrations'));
const config = readConfig({ ...process.env, JWT_SECRET: secret() });

const app = createApp((c) => ({
  db,
  config,
  now: () => Date.now(),
  ip: c.env?.incoming?.socket?.remoteAddress || 'unknown',
}));

// Everything that is not the API is the app itself.
if (fs.existsSync(path.join(publicDir, 'index.html'))) {
  const root = path.relative(process.cwd(), publicDir) || '.';
  const exceptApi = (handler) => (c, next) => (c.req.path.startsWith('/api/') ? next() : handler(c, next));
  app.use('*', exceptApi(serveStatic({ root })));
  app.get('*', exceptApi(serveStatic({ root, path: 'index.html' })));
}

serve({ fetch: app.fetch, port }, () => {
  console.log(`stokd is running at http://localhost:${port}`);
  console.log(`  database: ${databasePath}${applied.length ? ` (set up: ${applied.join(', ')})` : ''}`);
  if (!fs.existsSync(path.join(publicDir, 'index.html'))) console.log('  the app is not built yet: run "npm run build:app" to serve it from here too');
});
