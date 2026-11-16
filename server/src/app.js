import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { HttpError } from './errors.js';
import { authRoutes } from './auth.js';
import { syncRoutes } from './sync.js';
import { teamRoutes } from './team.js';

export const MAX_BODY_BYTES = 1024 * 1024;

const tooLarge = (c) => c.json({ error: { code: 'too_large', message: 'That is too much to send at once.' } }, 413);

/**
 * Builds the API. `resolve(c)` supplies what differs between runtimes:
 * `{ db, config, now, ip, log? }`. Node passes constants; Cloudflare reads bindings per request.
 */
export function createApp(resolve) {
  const app = new Hono();

  app.use('*', async (c, next) => {
    c.set('ctx', resolve(c));
    await next();
  });

  // The app may be served from another address (GitHub Pages) than the API: only listed origins may call it.
  app.use('/api/*', cors({
    origin: (origin, c) => (c.get('ctx').config.allowedOrigins.includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowHeaders: ['content-type', 'authorization'],
    maxAge: 86_400,
  }));

  app.use('/api/*', bodyLimit({ maxSize: MAX_BODY_BYTES, onError: tooLarge }));

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    if (error?.name === 'BodyLimitError') return tooLarge(c);
    (c.get('ctx')?.log ?? console.error)(error);
    return c.json({ error: { code: 'server_error', message: 'Something went wrong. Please try again.' } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404));

  app.get('/api/health', (c) => {
    const { config, now } = c.get('ctx');
    return c.json({ ok: true, version: config.version, time: now() });
  });

  authRoutes(app);
  syncRoutes(app);
  teamRoutes(app);

  return app;
}
