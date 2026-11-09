import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { portalFetch, PortalApiError } from '../api/client';
import { isPrivatePortalQuery } from '../api/private-query';

export function usePortalEvents() {
  const { reporter } = useAuth();
  const client = useQueryClient();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (!reporter) return;
    const abort = new AbortController();
    let events: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 1000;
    let checking = false;
    let disconnected = false;
    const invalidate = () => {
      void client.invalidateQueries({ queryKey: ['portal'] });
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
        await portalFetch('/me', { signal: abort.signal });
        if (!abort.signal.aborted && source === events && source.readyState === EventSource.CLOSED)
          schedule(connect);
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
      source.addEventListener('access.changed', () => {
        if (source === events) accessChanged();
      });
      source.onopen = () => {
        if (abort.signal.aborted || source !== events) return;
        setOffline(false);
        retryDelay = 1000;
        if (disconnected) {
          accessChanged();
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
