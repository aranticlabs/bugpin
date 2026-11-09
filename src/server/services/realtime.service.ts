import { Result } from '../utils/result.js';
import type { StaffEventType, StaffEventData } from '@shared/staff-events';
import type { PortalEvent } from '@shared/portal-types';
import { portalReportsRepo } from '../database/repositories/portal-reports.repo.js';

type Listener = (type: StaffEventType, data: StaffEventData) => void;
const sessions = new Map<string, Set<Listener>>();
type PortalListener = (event: PortalEvent) => void;
const portalSessions = new Map<
  string,
  { reporterId: string; listeners: Map<PortalListener, ReadonlySet<string>> }
>();

export const realtimeService = {
  subscribePortal(
    sessionId: string,
    reporterId: string,
    listener: PortalListener,
    limit: number,
    projects: ReadonlySet<string>
  ): Result<() => void> {
    const entry = portalSessions.get(sessionId) ?? {
      reporterId,
      listeners: new Map<PortalListener, ReadonlySet<string>>(),
    };
    if (entry.reporterId !== reporterId)
      return Result.fail('Authentication required', 'UNAUTHORIZED');
    if (entry.listeners.size >= limit) return Result.fail('Too many event streams', 'RATE_LIMITED');
    entry.listeners.set(listener, projects);
    portalSessions.set(sessionId, entry);
    return Result.ok(() => {
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0) portalSessions.delete(sessionId);
    });
  },

  invalidatePortalAccess(
    target: { sessionId: string } | { reporterId: string } | { projectId: string }
  ): void {
    for (const [sessionId, entry] of portalSessions) {
      if ('sessionId' in target && target.sessionId !== sessionId) continue;
      if ('reporterId' in target && target.reporterId !== entry.reporterId) continue;
      for (const [listener, projects] of [...entry.listeners]) {
        if ('projectId' in target && !projects.has(target.projectId)) continue;
        listener({ type: 'access.changed', data: {} });
      }
    }
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
      for (const listener of [...entry.listeners.keys()])
        listener({ type, data: { reportId: data.reportId, projectId: owner.projectId } });
    }
  },
};
