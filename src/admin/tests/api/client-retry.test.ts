import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api } from '../../api/client';

function respondWith(statuses: number[], headers: Record<string, string> = {}) {
  let calls = 0;
  const resolver = () => {
    const status = statuses[Math.min(calls, statuses.length - 1)];
    calls += 1;
    return HttpResponse.json(
      status < 400 ? { success: true } : { success: false, error: `Status ${status}` },
      { status, headers }
    );
  };
  return { resolver, getCalls: () => calls };
}

async function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  const settled = Promise.allSettled([promise]).then(([result]) => result);
  await vi.runAllTimersAsync();
  return settled;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('api client retry policy', () => {
  it('retries a GET that fails with 503 and resolves once the server recovers', async () => {
    const { resolver, getCalls } = respondWith([503, 503, 200]);
    server.use(http.get('/api/retry-probe', resolver));

    const result = await settle(api.get('/retry-probe'));

    expect(result.status).toBe('fulfilled');
    expect(getCalls()).toBe(3);
  });

  it('gives up on a GET after the maximum number of retries', async () => {
    const { resolver, getCalls } = respondWith([503]);
    server.use(http.get('/api/retry-probe', resolver));

    const result = await settle(api.get('/retry-probe'));

    expect(result.status).toBe('rejected');
    expect(getCalls()).toBe(4);
  });

  it.each([
    ['post', http.post],
    ['patch', http.patch],
    ['put', http.put],
    ['delete', http.delete],
  ] as const)('does not retry a %s that fails with 500', async (method, handler) => {
    const { resolver, getCalls } = respondWith([500, 200]);
    server.use(handler('/api/retry-probe', resolver));

    const result = await settle(api.request({ method, url: '/retry-probe', data: {} }));

    expect(result.status).toBe('rejected');
    expect(getCalls()).toBe(1);
  });

  it('surfaces a mutation error to the caller without waiting for a backoff', async () => {
    const { resolver, getCalls } = respondWith([500, 200]);
    server.use(http.patch('/api/retry-probe', resolver));

    // No timers are advanced here: a scheduled retry would leave the promise pending.
    const error: unknown = await api.patch('/retry-probe', { status: 'resolved' }).catch((e) => e);

    expect(vi.getTimerCount()).toBe(0);
    expect(getCalls()).toBe(1);
    expect(error).toMatchObject({ response: { status: 500 } });
  });

  it('does not retry a POST that fails with 429', async () => {
    const { resolver, getCalls } = respondWith([429, 200], { 'Retry-After': '1' });
    server.use(http.post('/api/retry-probe', resolver));

    const result = await settle(api.post('/retry-probe', {}));

    expect(result.status).toBe('rejected');
    expect(getCalls()).toBe(1);
  });

  it('waits for the Retry-After interval before retrying a GET that fails with 429', async () => {
    const { resolver, getCalls } = respondWith([429, 200], { 'Retry-After': '5' });
    server.use(http.get('/api/retry-probe', resolver));

    const promise = api.get('/retry-probe');
    await vi.advanceTimersByTimeAsync(4900);
    expect(getCalls()).toBe(1);

    await vi.advanceTimersByTimeAsync(200);
    await expect(promise).resolves.toMatchObject({ status: 200 });
    expect(getCalls()).toBe(2);
  });

  it('does not retry a GET when Retry-After exceeds the maximum wait', async () => {
    const { resolver, getCalls } = respondWith([429, 200], { 'Retry-After': '120' });
    server.use(http.get('/api/retry-probe', resolver));

    const result = await settle(api.get('/retry-probe'));

    expect(result.status).toBe('rejected');
    expect(getCalls()).toBe(1);
  });
});
