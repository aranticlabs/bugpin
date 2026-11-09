import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { STAFF_EVENT_TYPES } from '@shared/staff-events';

export function useStaffEvents(enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    let source: EventSource;
    let connected = false;
    let stopped = false;
    let attempts = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const invalidate = (event: MessageEvent<string>) => {
      let hint: unknown;
      try {
        hint = JSON.parse(event.data);
      } catch {
        return;
      }
      if (
        !hint ||
        typeof hint !== 'object' ||
        !('reportId' in hint) ||
        typeof hint.reportId !== 'string' ||
        !('projectId' in hint) ||
        typeof hint.projectId !== 'string'
      )
        return;
      for (const queryKey of [
        ['report', hint.reportId],
        ['reporterMessages', hint.reportId],
        ['report-history', hint.reportId],
        ['reports'],
        ['reporter-activity-count'],
        ['dashboard'],
        ['dashboard-stats'],
        ['report-view-counts'],
        ['pinned-projects'],
      ])
        void queryClient.invalidateQueries({ queryKey });
    };
    const connect = () => {
      if (stopped) return;
      const current = new EventSource('/api/events');
      source = current;
      current.onopen = () => {
        if (stopped || current !== source) return;
        if (connected) void queryClient.invalidateQueries();
        connected = true;
        attempts = 0;
      };
      current.onerror = () => {
        if (stopped || current !== source || current.readyState !== EventSource.CLOSED) return;
        current.close();
        clearTimeout(retry);
        retry = setTimeout(connect, Math.min(1000 * 2 ** Math.min(attempts++, 5), 30000));
      };
      for (const type of STAFF_EVENT_TYPES) current.addEventListener(type, invalidate);
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      source.close();
    };
  }, [enabled, queryClient]);
}
