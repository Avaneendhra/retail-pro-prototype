import { Hono } from 'hono';
import { HttpError } from './errors.js';

/**
 * Builds the API. `resolve(c)` supplies what differs between runtimes:
 * `{ db, config, now, ip }`. Node passes constants; Cloudflare reads bindings per request.
 */
export function createApp(resolve) {
  const app = new Hono();

  app.use('*', async (c, next) => {
    c.set('ctx', resolve(c));
    await next();
  });

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    console.error(error);
    return c.json({ error: { code: 'server_error', message: 'Something went wrong. Please try again.' } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404));

  app.get('/api/health', (c) => {
    const { config, now } = c.get('ctx');
    return c.json({ ok: true, version: config.version, time: now() });
  });

  return app;
}
