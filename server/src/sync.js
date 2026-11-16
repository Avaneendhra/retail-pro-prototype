// POST /api/sync: a device sends its changes and receives the shop's.
import { z } from 'zod';
import { requireUser, readBody, deviceIdField, deviceStatements } from './auth.js';
import { parseOp, statementsFor } from './ops.js';

export const MAX_OPS = 25;

const SyncBody = z.object({
  deviceId: deviceIdField,
  ops: z.array(z.unknown()).max(MAX_OPS).default([]),
});

export function syncRoutes(app) {
  app.post('/api/sync', requireUser, async (c) => {
    const { db, now } = c.get('ctx');
    const user = c.get('user');
    const body = await readBody(c, SyncBody);
    const at = now();
    const opContext = { shopId: user.shopId, userId: user.id, deviceId: body.deviceId, role: user.role, now: at };

    const accepted = [];
    const rejected = [];
    const [registerDevice] = deviceStatements(user.shopId, body.deviceId, '', at);
    const statements = [registerDevice];

    for (const raw of body.ops) {
      const parsed = parseOp(raw);
      if (!parsed.ok) {
        rejected.push({ id: parsed.id, reason: parsed.reason });
        continue;
      }
      if (accepted.includes(parsed.op.id)) continue; // the same change twice in one request
      const result = statementsFor(parsed.op, opContext);
      if (!Array.isArray(result)) {
        rejected.push({ id: parsed.op.id, reason: result.rejected });
        continue;
      }
      accepted.push(parsed.op.id);
      statements.push(...result);
    }

    await db.batch(statements);
    return c.json({ accepted, rejected });
  });
}
