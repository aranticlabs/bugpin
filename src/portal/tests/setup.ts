import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export class TestEventSource extends EventTarget {
  static CLOSED = 2;
  readyState = 0;
  static instances: TestEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn(() => {
    this.readyState = TestEventSource.CLOSED;
  });
  constructor(
    public url: string,
    public options?: EventSourceInit
  ) {
    super();
    TestEventSource.instances.push(this);
  }
}
vi.stubGlobal('EventSource', TestEventSource);
export const server = setupServer(
  http.get('/api/portal/projects', () => HttpResponse.json({ success: true, projects: [] })),
  http.get('/api/portal/reports', () =>
    HttpResponse.json({ success: true, reports: [], nextCursor: null, total: 0, unreadCount: 0 })
  )
);
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  TestEventSource.instances = [];
  server.resetHandlers();
  window.history.replaceState(null, '', '/');
});
afterAll(() => server.close());

Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = vi.fn(() => false);
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
