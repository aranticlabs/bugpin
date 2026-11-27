import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { portalFetch, PortalApiError } from '../api/client';
import { isPrivatePortalQuery } from '../api/private-query';
import type { PortalMe } from '@shared/portal-types';

function isNonRevokingAccessChange(event: Event): boolean {
  const data = 'data' in event ? event.data : undefined;
  if (typeof data !== 'string' || !data) return false;
  try {
    const parsed: unknown = JSON.parse(data);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'revoked' in parsed &&
      parsed.revoked === false
    );
  } catch {
    return false;
  }
}

export function usePortalEvents() {
  const { reporter, reconcileSession } = useAuth();
  const client = useQueryClient();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    setOffline(false);
    if (!reporter) return;
    const abort = new AbortController();
    let events: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 1000;
    let checking = false;
    let disconnected = false;
    const invalidate = () => {
      void client.invalidateQueries({ predicate: isPrivatePortalQuery });
    };
    const accessChanged = () => {
      void client.resetQueries({
        predicate: isPrivatePortalQuery,
      });
    };
    function stop() {
      abort.abort();
      clearTimeout(retryTimer);
      events?.close();
      events = null;
    }
    function schedule(retry: () => void) {
      if (abort.signal.aborted || retryTimer !== undefined) return;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        retry();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30000);
    }
    async function recover(source: EventSource) {
      if (checking || abort.signal.aborted || source !== events) return;
      checking = true;
      try {
        const me = await portalFetch<{ reporter?: PortalMe }>('/me', { signal: abort.signal });
        if (abort.signal.aborted || source !== events) return;
        // Another tab signed in to a different account and replaced the session cookie.
        if (me.reporter?.id !== reporter?.id) {
          stop();
          void reconcileSession();
          return;
        }
        if (source.readyState === EventSource.CLOSED) schedule(connect);
      } catch (error) {
        if (abort.signal.aborted || source !== events) return;
        if (error instanceof PortalApiError && error.status === 401) {
          stop();
          window.dispatchEvent(new Event('bugpin:portal-session-expired'));
        } else if (source.readyState === EventSource.CLOSED) {
          schedule(() => void recover(source));
        }
      } finally {
        checking = false;
      }
    }
    function connect() {
      if (abort.signal.aborted) return;
      events?.close();
      const source = new EventSource('/api/portal/events', { withCredentials: true });
      events = source;
      source.addEventListener('report.updated', () => {
        if (source === events) invalidate();
      });
      source.addEventListener('message.created', () => {
        if (source === events) invalidate();
      });
      source.addEventListener('access.changed', (event) => {
        if (source !== events) return;
        if (isNonRevokingAccessChange(event)) invalidate();
        else accessChanged();
      });
      source.onopen = () => {
        if (abort.signal.aborted || source !== events) return;
        setOffline(false);
        retryDelay = 1000;
        if (disconnected) {
          disconnected = false;
          invalidate();
        }
      };
      source.onerror = () => {
        if (abort.signal.aborted || source !== events) return;
        disconnected = true;
        setOffline(true);
        return recover(source);
      };
    }
    connect();
    return stop;
  }, [reporter?.id, client]);
  return Boolean(reporter) && offline;
}
