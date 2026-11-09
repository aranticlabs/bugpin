import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { portalFetch, PortalApiError } from '../api/client';

export function usePortalEvents() {
  const { reporter } = useAuth();
  const client = useQueryClient();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (!reporter) return;
    const abort = new AbortController();
    const events = new EventSource('/api/portal/events', { withCredentials: true });
    let checking = false;
    let disconnected = false;
    const invalidate = () => {
      void client.invalidateQueries({ queryKey: ['portal'] });
    };
    const accessChanged = () => {
      void client.resetQueries({
        predicate: (query) => query.queryKey[0] === 'portal' && query.queryKey[1] !== 'config',
      });
    };
    events.addEventListener('report.updated', invalidate);
    events.addEventListener('message.created', invalidate);
    events.addEventListener('access.changed', accessChanged);
    events.onopen = () => {
      setOffline(false);
      if (disconnected) {
        accessChanged();
        invalidate();
      }
    };
    events.onerror = async () => {
      if (checking || abort.signal.aborted) return;
      disconnected = true;
      setOffline(true);
      checking = true;
      try {
        await portalFetch('/me', { signal: abort.signal });
      } catch (error) {
        if (!abort.signal.aborted && error instanceof PortalApiError && error.status === 401) {
          events.close();
          window.dispatchEvent(new Event('bugpin:portal-session-expired'));
        }
      } finally {
        checking = false;
      }
    };
    return () => {
      abort.abort();
      events.close();
    };
  }, [reporter?.id, client]);
  return Boolean(reporter) && offline;
}
