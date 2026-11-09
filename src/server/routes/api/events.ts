import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { getBunServer } from 'hono/bun';
import type { StaffEventType, StaffEventData } from '@shared/staff-events';
import type { Server } from 'bun';
import { authMiddleware } from '../../middleware/auth.js';
import { authService } from '../../services/auth.service.js';
import { settingsCacheService } from '../../services/settings-cache.service.js';
import { realtimeService } from '../../services/realtime.service.js';

export const eventsRoutes = new Hono();
eventsRoutes.use(
  '*',
  async (c, next) =>
    c.req.header('Authorization')
      ? c.json(
          { success: false, error: 'UNAUTHORIZED', message: 'A staff session is required' },
          401
        )
      : next(),
  authMiddleware
);

eventsRoutes.get('/', async (c) => {
  const limit = (await settingsCacheService.getAll()).reporterPortalLimits.sseStreamsPerSession;
  let write: Parameters<typeof realtimeService.subscribe>[1] = () => {};
  const subscribed = realtimeService.subscribe(
    c.get('session').id,
    (type, data) => write(type, data),
    limit
  );
  if (!subscribed.success)
    return c.json({ success: false, error: subscribed.code, message: subscribed.error }, 429);
  if (c.env) getBunServer<Server<unknown>>(c)?.timeout(c.req.raw, 0);
  c.header('Cache-Control', 'no-store');
  c.header('X-Accel-Buffering', 'no');
  const sessionSecret = getCookie(c, 'session')!;
  const response = streamSSE(c, async (stream) => {
    let draining = false;
    const queue: [StaffEventType, StaffEventData][] = [];
    let ended = false;
    let finish: () => void;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const end = () => {
      if (ended) return;
      ended = true;
      clearInterval(heartbeat);
      subscribed.value();
      stream.abort();
      finish();
    };
    write = (type, data) => {
      if (ended) return;
      if (queue.length >= 32) {
        end();
        return;
      }
      queue.push([type, data]);
      if (draining) return;
      draining = true;
      void (async () => {
        try {
          while (queue.length && !ended) {
            const [event, hint] = queue.shift()!;
            await stream.writeSSE({ event, data: JSON.stringify(hint) });
          }
        } catch {
          end();
        } finally {
          draining = false;
        }
      })();
    };
    const heartbeat = setInterval(async () => {
      try {
        const checked = await authService.validateSession(sessionSecret);
        if (ended) return;
        if (
          !checked.success ||
          checked.value.user.mustChangePassword ||
          checked.value.user.twoFactorSetupRequired
        ) {
          end();
          return;
        }
        if (!draining) await stream.write(': heartbeat\n\n');
      } catch {
        end();
      }
    }, 25000);
    heartbeat.unref();
    stream.onAbort(end);
    try {
      await stream.write(': connected\n\n');
      await done;
    } finally {
      end();
    }
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
});
