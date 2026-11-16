// Runs stokd on Cloudflare Workers: the API here, the database in D1 (binding DB),
// and the built app served from ./public (see wrangler.jsonc).
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { d1Db } from './db/d1.js';

const app = createApp((c) => ({
  db: d1Db(c.env.DB),
  config: readConfig(c.env),
  now: () => Date.now(),
  ip: c.req.header('cf-connecting-ip') || 'unknown',
}));

export default { fetch: (request, env, context) => app.fetch(request, env, context) };
