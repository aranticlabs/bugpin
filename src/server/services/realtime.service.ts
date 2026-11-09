import { Result } from '../utils/result.js';
import type { StaffEventType, StaffEventData } from '@shared/staff-events';

type Listener = (type: StaffEventType, data: StaffEventData) => void;
const sessions = new Map<string, Set<Listener>>();

export const realtimeService = {
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
  },
};
