import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useStaffEvents } from '../../hooks/useStaffEvents';
import { createTestQueryClient, renderWithQuery } from '../utils';

class TestEventSource extends EventTarget {
  static CLOSED = 2;
  readyState = 0;
  onerror: (() => void) | null = null;
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  TestEventSource.instances = [];
});

describe('useStaffEvents', () => {
  it('recovers an initial refusal without refetching on the first successful connection', () => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', TestEventSource);
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { unmount } = renderWithQuery(<Harness />, { queryClient });
    const initial = TestEventSource.instances[0];
    initial.readyState = TestEventSource.CLOSED;
    act(() => initial.onerror?.());
    act(() => vi.advanceTimersByTime(1000));
    act(() => TestEventSource.instances[1].onopen?.());
    expect(invalidate).not.toHaveBeenCalled();
    unmount();
  });

  it('recovers closed connections with capped backoff, refetches on reconnect, and cancels retries on unmount', () => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', TestEventSource);
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { unmount } = renderWithQuery(<Harness />, { queryClient });
    const initial = TestEventSource.instances[0];
    act(() => initial.onopen?.());
    expect(invalidate).not.toHaveBeenCalled();
    for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      const current = TestEventSource.instances[TestEventSource.instances.length - 1];
      current.readyState = TestEventSource.CLOSED;
      act(() => current.onerror?.());
      const count = TestEventSource.instances.length;
      act(() => vi.advanceTimersByTime(delay - 1));
      expect(TestEventSource.instances).toHaveLength(count);
      act(() => vi.advanceTimersByTime(1));
      expect(TestEventSource.instances).toHaveLength(count + 1);
    }
    const recovered = TestEventSource.instances[TestEventSource.instances.length - 1];
    act(() => recovered.onopen?.());
    expect(invalidate).toHaveBeenCalledOnce();
    recovered.readyState = TestEventSource.CLOSED;
    act(() => recovered.onerror?.());
    const count = TestEventSource.instances.length;
    unmount();
    act(() => vi.advanceTimersByTime(30000));
    expect(TestEventSource.instances).toHaveLength(count);
  });

  it('invalidates all queries on connection/reconnection and only related data on hints', () => {
    vi.stubGlobal('EventSource', TestEventSource);
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { unmount } = renderWithQuery(<Harness />, { queryClient });
    const source = TestEventSource.instances[0];
    expect(source.url).toBe('/api/events');
    act(() => source.onopen?.());
    expect(invalidate).not.toHaveBeenCalled();
    act(() => source.onopen?.());
    expect(invalidate.mock.calls).toEqual([[]]);
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
