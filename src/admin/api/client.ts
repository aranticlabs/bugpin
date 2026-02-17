import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// Retry configuration
const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 1000;
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

// Extend config to track retry count
interface ExtendedAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
}

// Sleep helper for retry delays
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Check if error is retryable
function isRetryable(error: AxiosError): boolean {
  // Don't retry if no response (network error) - those are usually permanent
  if (!error.response) {
    // Retry network errors (but not timeout)
    return error.code === 'ECONNRESET' || error.code === 'ECONNABORTED';
  }

  // Retry specific status codes
  return RETRYABLE_STATUS_CODES.includes(error.response.status);
}

// Calculate delay with exponential backoff
function getRetryDelay(retryCount: number): number {
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

    // Check if we should retry
    if (config && isRetryable(error) && (config._retryCount ?? 0) < RETRY_COUNT) {
      config._retryCount = (config._retryCount ?? 0) + 1;

      const delay = getRetryDelay(config._retryCount);
      console.warn(
        `[API] Request failed with ${error.response?.status ?? 'network error'}, ` +
          `retrying (${config._retryCount}/${RETRY_COUNT}) in ${delay}ms...`,
      );

      await sleep(delay);
      return api.request(config);
    }

    return Promise.reject(error);
  },
);

// Helper to check if an error is an Axios error
export function isApiError(
  error: unknown,
): error is AxiosError<{ message?: string; error?: string }> {
  return axios.isAxiosError(error);
}

// Helper to extract error message from API response
export function getApiErrorMessage(
  error: unknown,
  fallback = 'An unexpected error occurred',
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
