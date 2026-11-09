import { Result } from '../utils/result.js';
import type { StaffEventType, StaffEventData } from '@shared/staff-events';
import type { PortalEvent } from '@shared/portal-types';
import { portalReportsRepo } from '../database/repositories/portal-reports.repo.js';

type Listener = (type: StaffEventType, data: StaffEventData) => void;
const sessions = new Map<string, Set<Listener>>();
type PortalListener = (event: PortalEvent) => void;
const portalSessions = new Map<string, { reporterId: string; listeners: Set<PortalListener> }>();

export const realtimeService = {
  subscribePortal(
    sessionId: string,
    reporterId: string,
    listener: PortalListener,
    limit: number
  ): Result<() => void> {
    const entry = portalSessions.get(sessionId) ?? {
      reporterId,
      listeners: new Set<PortalListener>(),
    };
    if (entry.reporterId !== reporterId)
      return Result.fail('Authentication required', 'UNAUTHORIZED');
    if (entry.listeners.size >= limit) return Result.fail('Too many event streams', 'RATE_LIMITED');
    entry.listeners.add(listener);
    portalSessions.set(sessionId, entry);
    return Result.ok(() => {
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0) portalSessions.delete(sessionId);
    });
  },

  invalidatePortalAccess(): void {
    for (const { listeners } of portalSessions.values())
      for (const listener of [...listeners]) listener({ type: 'access.changed', data: {} });
  },
  subscribe(sessionId: string, listener: Listener, limit: number): Result<() => void> {
    const listeners = sessions.get(sessionId) ?? new Set<Listener>();
    if (listeners.size >= limit) return Result.fail('Too many event streams', 'RATE_LIMITED');
    listeners.add(listener);
    sessions.set(sessionId, listeners);
    return Result.ok(() => {
      listeners.delete(listener);
      if (listeners.size === 0) sessions.delete(sessionId);
    });
  },

  publish(type: StaffEventType, data: StaffEventData): void {
    for (const listeners of sessions.values())
      for (const listener of [...listeners]) listener(type, data);
    if (!portalSessions.size || type === 'reporter_activity.changed') return;
    const owner = portalReportsRepo.eventOwner(data.reportId);
    if (!owner) return;
    for (const entry of portalSessions.values()) {
      if (entry.reporterId !== owner.reporterId) continue;
      for (const listener of [...entry.listeners])
        listener({ type, data: { reportId: data.reportId, projectId: owner.projectId } });
    }
  },
};
