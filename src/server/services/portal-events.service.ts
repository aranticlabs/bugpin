import { portalReportsRepo } from '../database/repositories/portal-reports.repo.js';
import { reporterAuthService } from './reporter-auth.service.js';
import { realtimeService } from './realtime.service.js';
import { settingsCacheService } from './settings-cache.service.js';
import { Result } from '../utils/result.js';
import type { PortalEvent } from '@shared/portal-types';

export interface PortalEventCheck {
  event: PortalEvent | null;
  close: boolean;
}

export const portalEventsService = {
  async open(
    secret: string,
    listener: (result: Result<PortalEventCheck>) => void
  ): Promise<
    Result<{
      revalidate: () => Result<PortalEventCheck>;
      unsubscribe: () => void;
    }>
  > {
    const settings = await settingsCacheService.getAll();
    const session = reporterAuthService.validateSession(secret, false);
    if (!session.success) return session;
    const reporterId = session.value.reporter.id;
    function scope() {
      return new Set(portalReportsRepo.visibleScope(reporterId).map((row) => row.id));
    }
    let visible = scope();
    function revalidate(event?: PortalEvent): Result<PortalEventCheck> {
      try {
        const checked = reporterAuthService.validateSession(secret, false);
        if (!checked.success) return checked;
        const current = scope();
        const lost = [...visible].some((id) => !current.has(id));
        const gained = [...current].some((id) => !visible.has(id));
        visible = current;
        if (lost)
          return Result.ok({
            event: { type: 'access.changed', data: { revoked: true } },
            close: true,
          });
        if (event && event.type !== 'access.changed' && visible.has(event.data.reportId))
          return Result.ok({ event, close: false });
        if (gained || event?.type === 'access.changed')
          return Result.ok({
            event: { type: 'access.changed', data: { revoked: false } },
            close: false,
          });
        return Result.ok({ event: null, close: false });
      } catch {
        return Result.fail('Unable to check portal access', 'ACCESS_CHECK_FAILED');
      }
    }
    const subscribed = realtimeService.subscribePortal(
      session.value.sessionId,
      reporterId,
      (event) => listener(revalidate(event)),
      settings.reporterPortalLimits.sseStreamsPerSession
    );
    if (!subscribed.success) return subscribed;
    return Result.ok({ revalidate: () => revalidate(), unsubscribe: subscribed.value });
  },
};
