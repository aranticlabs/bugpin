import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { getBunServer } from 'hono/bun';
import type { Server } from 'bun';
import type { PortalEvent } from '@shared/portal-types';
import { reporterAuthMiddleware, REPORTER_SESSION_COOKIE } from '../../middleware/reporter-auth.js';
import { reporterAuthService } from '../../services/reporter-auth.service.js';
import { realtimeService } from '../../services/realtime.service.js';
import { settingsCacheService } from '../../services/settings-cache.service.js';
import { portalReportsRepo } from '../../database/repositories/portal-reports.repo.js';
import { errorStatus } from '../../utils/http-status.js';

export const portalEventsRoutes = new Hono();
portalEventsRoutes.get('/events', reporterAuthMiddleware, async (c) => {
  const secret = getCookie(c, REPORTER_SESSION_COOKIE)!;
  const limit = (await settingsCacheService.getAll()).reporterPortalLimits.sseStreamsPerSession;
  const checked = reporterAuthService.validateSession(secret);
  if (!checked.success)
    return c.json({ success: false, error: checked.code, message: checked.error }, 401);
  const reporterId = checked.value.reporter.id;
  let visible = new Set(portalReportsRepo.visibleIds(reporterId));
  let receive: (event: PortalEvent) => void = () => {};
  const subscribed = realtimeService.subscribePortal(
    checked.value.sessionId,
    reporterId,
    (event) => receive(event),
    limit
  );
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
      subscribed.value();
      stream.abort();
      finish();
    };
    function checkAccess(): boolean {
      if (!reporterAuthService.validateSession(secret).success) {
        end();
        return false;
      }
      const current = new Set(portalReportsRepo.visibleIds(reporterId));
      const lost = [...visible].some((id) => !current.has(id));
      visible = current;
      if (lost) {
        queue.length = 0;
        queue.push({ type: 'access.changed', data: {} });
        closing = true;
        drain();
        return false;
      }
      return true;
    }
    function drain() {
      if (draining || ended) return;
      draining = true;
      void (async () => {
        try {
          while (queue.length && !ended) {
            if (!reporterAuthService.validateSession(secret).success) {
              end();
              break;
            }
            if (!closing && !checkAccess()) continue;
            const event = queue.shift()!;
            if (event.type !== 'access.changed' && !visible.has(event.data.reportId)) continue;
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
    receive = (event) => {
      if (ended || closing) return;
      try {
        if (!checkAccess() || event.type === 'access.changed') return;
        if (!visible.has(event.data.reportId)) return;
        if (queue.length >= 32) {
          end();
          return;
        }
        queue.push(event);
        drain();
      } catch {
        end();
      }
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
        if (!checkAccess() || closing) return;
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
