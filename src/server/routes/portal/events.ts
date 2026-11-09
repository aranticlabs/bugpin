import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { getBunServer } from 'hono/bun';
import type { Server } from 'bun';
import type { PortalEvent } from '@shared/portal-types';
import { reporterAuthMiddleware, REPORTER_SESSION_COOKIE } from '../../middleware/reporter-auth.js';
import {
  portalEventsService,
  type PortalEventCheck,
} from '../../services/portal-events.service.js';
import type { Result } from '../../utils/result.js';
import { errorStatus } from '../../utils/http-status.js';

export const portalEventsRoutes = new Hono();
portalEventsRoutes.get('/events', reporterAuthMiddleware, async (c) => {
  const secret = getCookie(c, REPORTER_SESSION_COOKIE)!;
  let receive: (result: Result<PortalEventCheck>) => void = () => {};
  const subscribed = await portalEventsService.open(secret, (result) => receive(result));
  if (!subscribed.success)
    return c.json(
      { success: false, error: subscribed.code, message: subscribed.error },
      errorStatus(subscribed.code)
    );
  if (c.env) getBunServer<Server<unknown>>(c)?.timeout(c.req.raw, 0);
  c.header('Cache-Control', 'no-store');
  c.header('X-Accel-Buffering', 'no');
  const response = streamSSE(c, async (stream) => {
    const queue: PortalEvent[] = [];
    let draining = false;
    let closing = false;
    let ended = false;
    let completedWrites = 0;
    let previousHeartbeatWrites = -1;
    let heartbeatPending = false;
    let finish: () => void;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const end = () => {
      if (ended) return;
      ended = true;
      clearInterval(heartbeat);
      subscribed.value.unsubscribe();
      stream.abort();
      finish();
    };
    function drain() {
      if (draining || ended) return;
      draining = true;
      void (async () => {
        try {
          while (queue.length && !ended) {
            const event = queue.shift()!;
            await stream.writeSSE({ event: event.type, data: JSON.stringify(event.data) });
            completedWrites++;
            if (closing) end();
          }
        } catch {
          end();
        } finally {
          draining = false;
        }
      })();
    }
    receive = (result) => {
      if (ended || closing) return;
      if (!result.success) {
        end();
        return;
      }
      const { event, close } = result.value;
      if (close) {
        queue.length = 0;
        closing = true;
      }
      if (!event) return;
      if (queue.length >= 32) {
        end();
        return;
      }
      queue.push(event);
      drain();
    };
    const heartbeat = setInterval(async () => {
      if (ended) return;
      if (heartbeatPending || (draining && completedWrites === previousHeartbeatWrites)) {
        end();
        return;
      }
      previousHeartbeatWrites = draining ? completedWrites : -1;
      heartbeatPending = true;
      try {
        receive(subscribed.value.revalidate());
        if (ended || closing) return;
        if (!draining) await stream.write(': heartbeat\n\n');
      } catch {
        end();
      } finally {
        heartbeatPending = false;
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
