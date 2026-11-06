import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 1000;
const MAX_RETRY_AFTER_MS = 30000;
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

// Only methods that are safe to repeat are retried. A failed POST, PATCH, PUT, or DELETE
// may already have been applied on the server, so replaying it risks duplicate writes.
const RETRYABLE_METHODS = ['get', 'head', 'options'];

interface ExtendedAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableMethod(config: ExtendedAxiosRequestConfig): boolean {
  // Axios defaults a missing method to GET before dispatching.
  return RETRYABLE_METHODS.includes((config.method ?? 'get').toLowerCase());
}

function isRetryable(error: AxiosError): boolean {
  if (!error.response) {
    return error.code === 'ECONNRESET' || error.code === 'ECONNABORTED';
  }

  return RETRYABLE_STATUS_CODES.includes(error.response.status);
}

// Parses a Retry-After header given either as delta-seconds or as an HTTP date.
function parseRetryAfter(error: AxiosError): number | null {
  const header: unknown = error.response?.headers?.['retry-after'];
  if (typeof header !== 'string' && typeof header !== 'number') {
    return null;
  }

  const value = String(header).trim();
  if (/^\d+$/.test(value)) {
    return Number(value) * 1000;
  }

  const date = Date.parse(value);
  if (Number.isNaN(date)) {
    return null;
  }
  return Math.max(0, date - Date.now());
}

// Returns the delay before the next attempt, or null when the request should not be retried.
function getRetryDelay(error: AxiosError, retryCount: number): number | null {
  if (error.response?.status === 429) {
    const retryAfter = parseRetryAfter(error);
    if (retryAfter !== null) {
      return retryAfter <= MAX_RETRY_AFTER_MS ? retryAfter : null;
    }
  }

  return RETRY_DELAY_MS * Math.pow(2, retryCount);
}

// Create axios instance
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout
});

const isTestEnv = import.meta.env.MODE === 'test';

// Request interceptor - initialize retry count
api.interceptors.request.use((config: ExtendedAxiosRequestConfig) => {
  config._retryCount = config._retryCount ?? 0;
  return config;
});

// Response interceptor for error handling and retries
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as ExtendedAxiosRequestConfig | undefined;

    // Handle 401 - redirect to login (don't retry)
    if (error.response?.status === 401) {
      // Only redirect if not already on login page
      if (
        !isTestEnv &&
        typeof window !== 'undefined' &&
        !window.location.pathname.includes('/login')
      ) {
        window.location.href = '/admin/login';
      }
      return Promise.reject(error);
    }

    if (
      config &&
      isRetryableMethod(config) &&
      isRetryable(error) &&
      (config._retryCount ?? 0) < RETRY_COUNT
    ) {
      const delay = getRetryDelay(error, (config._retryCount ?? 0) + 1);
      if (delay === null) {
        return Promise.reject(error);
      }
      config._retryCount = (config._retryCount ?? 0) + 1;

      console.warn(
        `[API] Request failed with ${error.response?.status ?? 'network error'}, ` +
          `retrying (${config._retryCount}/${RETRY_COUNT}) in ${delay}ms...`
      );

      await sleep(delay);
      return api.request(config);
    }

    return Promise.reject(error);
  }
);

// Helper to check if an error is an Axios error
export function isApiError(
  error: unknown
): error is AxiosError<{ message?: string; error?: string }> {
  return axios.isAxiosError(error);
}

// Helper to extract error message from API response
export function getApiErrorMessage(
  error: unknown,
  fallback = 'An unexpected error occurred'
): string {
  if (isApiError(error)) {
    return (
      error.response?.data?.message ?? error.response?.data?.error ?? error.message ?? fallback
    );
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
