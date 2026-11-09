import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useStaffEvents } from '../../hooks/useStaffEvents';
import { createTestQueryClient, renderWithQuery } from '../utils';

class TestEventSource extends EventTarget {
  static instances: TestEventSource[] = [];
  onopen: (() => void) | null = null;
  close = vi.fn();
  constructor(readonly url: string) {
    super();
    TestEventSource.instances.push(this);
  }
}

function Harness({ enabled = true }: { enabled?: boolean }) {
  useStaffEvents(enabled);
  return null;
}

afterEach(() => {
  vi.unstubAllGlobals();
  TestEventSource.instances = [];
});

describe('useStaffEvents', () => {
  it('invalidates all queries on connection/reconnection and only related data on hints', () => {
    vi.stubGlobal('EventSource', TestEventSource);
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { unmount } = renderWithQuery(<Harness />, { queryClient });
    const source = TestEventSource.instances[0];
    expect(source.url).toBe('/api/events');
    act(() => {
      source.onopen?.();
      source.onopen?.();
    });
    expect(invalidate.mock.calls).toEqual([[], []]);
    invalidate.mockClear();
    act(() => {
      source.dispatchEvent(
        new MessageEvent('message.created', {
          data: JSON.stringify({ reportId: 'r1', projectId: 'p1' }),
        })
      );
    });
    for (const queryKey of [
      ['report', 'r1'],
      ['reporterMessages', 'r1'],
      ['report-history', 'r1'],
      ['reports'],
      ['reporter-activity-count'],
      ['dashboard'],
    ]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
    invalidate.mockClear();
    act(() => {
      source.dispatchEvent(new MessageEvent('report.updated', { data: '{broken' }));
      source.dispatchEvent(
        new MessageEvent('reporter_activity.changed', { data: '{"reportId":1}' })
      );
    });
    expect(invalidate).not.toHaveBeenCalled();
    unmount();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it('opens no stream while staff data is unavailable', () => {
    vi.stubGlobal('EventSource', TestEventSource);
    renderWithQuery(<Harness enabled={false} />);
    expect(TestEventSource.instances).toHaveLength(0);
  });
});
