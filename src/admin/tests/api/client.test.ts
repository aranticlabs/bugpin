import { describe, it, expect, vi, afterEach } from 'vitest';
import { api, getApiErrorMessage, isApiError } from '../../api/client';

type ResponseHandler = (error: unknown) => Promise<unknown>;
type RequestHandler = (config: Record<string, unknown>) => Record<string, unknown>;

function getResponseHandler(): ResponseHandler {
  const handlers = (
    api.interceptors.response as unknown as {
      handlers: Array<{ rejected?: ResponseHandler }>;
    }
  ).handlers;
  const handler = handlers.find((item) => item?.rejected)?.rejected;
  if (!handler) {
    throw new Error('Response interceptor not found');
  }
  return handler;
}

function getRequestHandler(): RequestHandler {
  const handlers = (
    api.interceptors.request as unknown as {
      handlers: Array<{ fulfilled?: RequestHandler }>;
    }
  ).handlers;
  const handler = handlers.find((item) => item?.fulfilled)?.fulfilled;
  if (!handler) {
    throw new Error('Request interceptor not found');
  }
  return handler;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('api client', () => {
  it('initializes retry count on request', () => {
    const handler = getRequestHandler();
    const config = handler({ headers: {} });
    expect(config._retryCount).toBe(0);

    const configWithRetry = handler({ headers: {}, _retryCount: 2 });
    expect(configWithRetry._retryCount).toBe(2);
  });

  it('retries on retryable status with exponential backoff', async () => {
    vi.useFakeTimers();
    const handler = getResponseHandler();
    const requestSpy = vi.spyOn(api, 'request').mockResolvedValue({ data: { ok: true } });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const error = {
      config: { _retryCount: 0 },
      response: { status: 500 },
    };

    const promise = handler(error);
    await vi.runAllTimersAsync();
    await promise;

    expect(requestSpy).toHaveBeenCalledWith({ _retryCount: 1 });
    expect(warnSpy).toHaveBeenCalled();
  });

  it('retries on network error codes without response', async () => {
    vi.useFakeTimers();
    const handler = getResponseHandler();
    const requestSpy = vi.spyOn(api, 'request').mockResolvedValue({ data: { ok: true } });

    const error = {
      config: { _retryCount: 0 },
      response: undefined,
      code: 'ECONNRESET',
    };

    const promise = handler(error);
    await vi.runAllTimersAsync();
    await promise;

    expect(requestSpy).toHaveBeenCalledWith({ _retryCount: 1 });
  });

  it('does not retry on non-retryable status', async () => {
    const handler = getResponseHandler();
    const requestSpy = vi.spyOn(api, 'request').mockResolvedValue({ data: { ok: true } });

    const error = {
      config: { _retryCount: 0 },
      response: { status: 400 },
    };

    await expect(handler(error)).rejects.toBe(error);
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('does not redirect on 401 in test mode', async () => {
    const handler = getResponseHandler();
    const requestSpy = vi.spyOn(api, 'request').mockResolvedValue({ data: { ok: true } });
    const originalHref = window.location.href;

    const error = {
      config: { _retryCount: 0 },
      response: { status: 401 },
    };

    await expect(handler(error)).rejects.toBe(error);
    expect(window.location.href).toBe(originalHref);
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('formats API error messages', () => {
    const axiosError = {
      isAxiosError: true,
      response: { data: { message: 'Nope' } },
      message: 'Fallback',
    };

    expect(isApiError(axiosError)).toBe(true);
    expect(getApiErrorMessage(axiosError)).toBe('Nope');

    const axiosErrorAlt = {
      isAxiosError: true,
      response: { data: { error: 'Bad' } },
      message: 'Fallback',
    };
    expect(getApiErrorMessage(axiosErrorAlt)).toBe('Bad');

    expect(getApiErrorMessage(new Error('Boom'))).toBe('Boom');
    expect(getApiErrorMessage('oops', 'Default')).toBe('Default');
  });
});
