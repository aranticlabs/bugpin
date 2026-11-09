import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { STAFF_EVENT_TYPES } from '@shared/staff-events';

export function useStaffEvents(enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/events');
    source.onopen = () => {
      void queryClient.invalidateQueries();
    };
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
    for (const type of STAFF_EVENT_TYPES) source.addEventListener(type, invalidate);
    return () => source.close();
  }, [enabled, queryClient]);
}
