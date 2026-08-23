import { redactSensitiveText } from '@shared/privacy';

// Extend XMLHttpRequest for tracking
declare global {
  interface XMLHttpRequest {
    _bugpinMethod?: string;
    _bugpinUrl?: string;
  }
}

export interface BrowserInfo {
  name: string;
  version: string;
  userAgent: string;
}

export interface DeviceInfo {
  type: 'desktop' | 'tablet' | 'mobile';
  os: string;
  osVersion?: string;
}

export interface ViewportInfo {
  width: number;
  height: number;
  devicePixelRatio: number;
  orientation?: 'landscape' | 'portrait';
}

export interface ConsoleError {
  type: 'error' | 'warn' | 'log';
  message: string;
  source?: string;
  line?: number;
  timestamp: string;
}

export interface NetworkError {
  url: string;
  method: string;
  status: number;
  statusText: string;
  timestamp: string;
}

export interface UserActivity {
  type: 'button' | 'link' | 'input' | 'select' | 'checkbox' | 'other';
  text?: string;
  url?: string;
  inputType?: string;
  timestamp: string;
}

export interface StorageKeys {
  cookies: string[];
  localStorage: string[];
  sessionStorage: string[];
}

export interface PageContext {
  url: string;
  title?: string;
  referrer?: string;
  browser: BrowserInfo;
  device: DeviceInfo;
  viewport: ViewportInfo;
  timestamp: string;
  timezone?: string;
  pageLoadTime?: number;
  consoleErrors?: ConsoleError[];
  networkErrors?: NetworkError[];
  userActivity?: UserActivity[];
  storageKeys?: StorageKeys;
}

// Store diagnostic signals and user activity in separate bounded buffers.
const capturedErrors: ConsoleError[] = [];
const capturedNetworkErrors: NetworkError[] = [];
const capturedUserActivity: UserActivity[] = [];
const MAX_ACTIVITY_ITEMS = 30;
const MAX_CONSOLE_ITEMS = 50;
const MAX_NETWORK_ITEMS = 50;
const MAX_MESSAGE_LENGTH = 2048;

let isDiagnosticCaptureActive = false;
let userActivityListener: ((event: Event) => void) | null = null;

export interface ErrorCaptureOptions {
  consoleCapture?: boolean;
  networkCapture?: boolean;
}

export interface CaptureContextOptions {
  consoleCapture?: boolean;
  networkCapture?: boolean;
  userActivityCapture?: boolean;
  storageKeysCapture?: boolean;
}

function pushBounded<T>(items: T[], item: T, limit: number): void {
  items.push(item);
  if (items.length > limit) {
    items.shift();
  }
}

function truncateMessage(value: string): string {
  return value.slice(0, MAX_MESSAGE_LENGTH);
}

function sanitizeActivityText(value: string | null | undefined, limit: number): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return redactSensitiveText(normalized).slice(0, limit);
}

function sanitizeActivityUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return redactSensitiveText(value).slice(0, MAX_MESSAGE_LENGTH);
}

function getUnhandledReason(event: PromiseRejectionEvent | Event): unknown {
  if ('reason' in event) {
    return event.reason;
  }
  return (event as CustomEvent<{ reason?: unknown }>).detail?.reason;
}

/**
 * Start bounded console and network diagnostic capture.
 */
export function startErrorCapture(options: ErrorCaptureOptions = {}): void {
  if (isDiagnosticCaptureActive) return;
  isDiagnosticCaptureActive = true;

  const consoleCapture = options.consoleCapture ?? true;
  const networkCapture = options.networkCapture ?? true;

  if (consoleCapture) {
    const originalError = console.error;
    console.error = (...args) => {
      pushBounded(
        capturedErrors,
        {
          type: 'error',
          message: truncateMessage(redactSensitiveText(args.map((arg) => String(arg)).join(' '))),
          timestamp: new Date().toISOString(),
        },
        MAX_CONSOLE_ITEMS
      );
      originalError.apply(console, args);
    };

    const originalWarn = console.warn;
    console.warn = (...args) => {
      pushBounded(
        capturedErrors,
        {
          type: 'warn',
          message: truncateMessage(redactSensitiveText(args.map((arg) => String(arg)).join(' '))),
          timestamp: new Date().toISOString(),
        },
        MAX_CONSOLE_ITEMS
      );
      originalWarn.apply(console, args);
    };

    const originalOnError = window.onerror;
    window.onerror = (message, source, line, column, error) => {
      pushBounded(
        capturedErrors,
        {
          type: 'error',
          message: truncateMessage(redactSensitiveText(String(message))),
          source: source ? redactSensitiveText(source) : undefined,
          line: line || undefined,
          timestamp: new Date().toISOString(),
        },
        MAX_CONSOLE_ITEMS
      );
      if (originalOnError) {
        return originalOnError.apply(window, [message, source, line, column, error]);
      }
      return false;
    };

    window.addEventListener('unhandledrejection', (event) => {
      pushBounded(
        capturedErrors,
        {
          type: 'error',
          message: truncateMessage(
            redactSensitiveText(`Unhandled Promise Rejection: ${String(getUnhandledReason(event))}`)
          ),
          timestamp: new Date().toISOString(),
        },
        MAX_CONSOLE_ITEMS
      );
    });
  }

  if (networkCapture) {
    const originalFetch = window.fetch.bind(window);
    (
      window as unknown as {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
      }
    ).fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;
      const method = init?.method || 'GET';

      try {
        const response = await originalFetch(input, init);
        if (response.status >= 300) {
          pushBounded(
            capturedNetworkErrors,
            {
              url: truncateMessage(redactSensitiveText(url)),
              method,
              status: response.status,
              statusText: truncateMessage(redactSensitiveText(response.statusText)),
              timestamp: new Date().toISOString(),
            },
            MAX_NETWORK_ITEMS
          );
        }
        return response;
      } catch (error) {
        pushBounded(
          capturedNetworkErrors,
          {
            url: truncateMessage(redactSensitiveText(url)),
            method,
            status: 0,
            statusText: truncateMessage(
              redactSensitiveText(error instanceof Error ? error.message : 'Network Error')
            ),
            timestamp: new Date().toISOString(),
          },
          MAX_NETWORK_ITEMS
        );
        throw error;
      }
    };

    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method: string, url: string | URL) {
      this._bugpinMethod = method;
      this._bugpinUrl = typeof url === 'string' ? url : url.href;
      return originalXHROpen.apply(
        this,
        arguments as unknown as Parameters<typeof originalXHROpen>
      );
    };

    XMLHttpRequest.prototype.send = function () {
      this.addEventListener('load', function () {
        if (this.status >= 300) {
          pushBounded(
            capturedNetworkErrors,
            {
              url: truncateMessage(redactSensitiveText(this._bugpinUrl || '')),
              method: this._bugpinMethod || 'GET',
              status: this.status,
              statusText: truncateMessage(redactSensitiveText(this.statusText)),
              timestamp: new Date().toISOString(),
            },
            MAX_NETWORK_ITEMS
          );
        }
      });
      return originalXHRSend.apply(
        this,
        arguments as unknown as Parameters<typeof originalXHRSend>
      );
    };
  }
}

function addUserActivity(activity: UserActivity): void {
  pushBounded(capturedUserActivity, activity, MAX_ACTIVITY_ITEMS);
}

function captureUserActivity(event: Event): void {
  const target = event.target as HTMLElement | null;
  if (!target || typeof target.closest !== 'function') return;
  if (target.closest('[data-bugpin-exclude], [data-bugpin-private]')) return;

  let activity: UserActivity | null = null;

  if (target.tagName === 'BUTTON' || target.closest('button')) {
    const button = target.tagName === 'BUTTON' ? target : target.closest('button');
    activity = {
      type: 'button',
      text: sanitizeActivityText(button?.textContent, 50),
      timestamp: new Date().toISOString(),
    };
  } else if (target.tagName === 'A' || target.closest('a')) {
    const link = (
      target.tagName === 'A' ? target : target.closest('a')
    ) as HTMLAnchorElement | null;
    activity = {
      type: 'link',
      text: sanitizeActivityText(link?.textContent, 50),
      url: sanitizeActivityUrl(link?.href),
      timestamp: new Date().toISOString(),
    };
  } else if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
    const input = target as HTMLInputElement;
    activity = {
      type: 'checkbox',
      text: sanitizeActivityText(input.name || input.id, 50),
      timestamp: new Date().toISOString(),
    };
  } else if (target.tagName === 'INPUT') {
    const input = target as HTMLInputElement;
    activity = {
      type: 'input',
      inputType: input.type || 'text',
      text: sanitizeActivityText(input.name || input.placeholder, 30),
      timestamp: new Date().toISOString(),
    };
  } else if (target.tagName === 'SELECT' || target.closest('[role="combobox"]')) {
    const select = target.tagName === 'SELECT' ? (target as HTMLSelectElement) : null;
    activity = {
      type: 'select',
      text: sanitizeActivityText(select?.name, 50),
      timestamp: new Date().toISOString(),
    };
  } else if (
    target.onclick ||
    target.getAttribute('role') === 'button' ||
    target.classList.contains('btn') ||
    target.closest('[role="button"]')
  ) {
    activity = {
      type: 'other',
      text: sanitizeActivityText(target.textContent, 50),
      timestamp: new Date().toISOString(),
    };
  }

  if (activity) {
    addUserActivity(activity);
  }
}

export function startUserActivityCapture(): void {
  if (userActivityListener) return;
  userActivityListener = captureUserActivity;
  document.addEventListener('click', userActivityListener, true);
}

export function stopUserActivityCapture(): void {
  if (!userActivityListener) return;
  document.removeEventListener('click', userActivityListener, true);
  userActivityListener = null;
}

export function clearUserActivity(): void {
  capturedUserActivity.length = 0;
}

export function getUserActivity(): UserActivity[] {
  return [...capturedUserActivity];
}

export function removeUserActivity(index: number): void {
  if (index < 0 || index >= capturedUserActivity.length) return;
  capturedUserActivity.splice(index, 1);
}

export function isUserActivityCaptureActive(): boolean {
  return userActivityListener !== null;
}

/**
 * Get browser information from user agent
 */
function getBrowserInfo(): BrowserInfo {
  const ua = navigator.userAgent;
  let name = 'Unknown';
  let version = '';

  // Detect browser
  if (ua.includes('Firefox/')) {
    name = 'Firefox';
    version = ua.match(/Firefox\/([\d.]+)/)?.[1] || '';
  } else if (ua.includes('Edg/')) {
    name = 'Edge';
    version = ua.match(/Edg\/([\d.]+)/)?.[1] || '';
  } else if (ua.includes('Chrome/')) {
    name = 'Chrome';
    version = ua.match(/Chrome\/([\d.]+)/)?.[1] || '';
  } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    name = 'Safari';
    version = ua.match(/Version\/([\d.]+)/)?.[1] || '';
  } else if (ua.includes('Opera/') || ua.includes('OPR/')) {
    name = 'Opera';
    version = ua.match(/(?:Opera|OPR)\/([\d.]+)/)?.[1] || '';
  }

  return { name, version, userAgent: ua };
}

/**
 * Get device information
 */
function getDeviceInfo(): DeviceInfo {
  const ua = navigator.userAgent;
  let type: 'desktop' | 'tablet' | 'mobile' = 'desktop';
  let os = 'Unknown';
  let osVersion: string | undefined;

  // Detect device type
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) {
    if (/iPad|Tablet/i.test(ua) || (window.innerWidth >= 768 && /Android/i.test(ua))) {
      type = 'tablet';
    } else {
      type = 'mobile';
    }
  }

  // Detect OS
  if (ua.includes('Windows')) {
    os = 'Windows';
    const versionMatch = ua.match(/Windows NT ([\d.]+)/);
    if (versionMatch) {
      const ntVersion = versionMatch[1];
      const versionMap: Record<string, string> = {
        '10.0': '10/11',
        '6.3': '8.1',
        '6.2': '8',
        '6.1': '7',
        '6.0': 'Vista',
      };
      osVersion = versionMap[ntVersion] || ntVersion;
    }
  } else if (ua.includes('Mac OS X')) {
    os = 'macOS';
    osVersion = ua.match(/Mac OS X ([\d._]+)/)?.[1]?.replace(/_/g, '.');
  } else if (ua.includes('Linux')) {
    os = ua.includes('Android') ? 'Android' : 'Linux';
    if (os === 'Android') {
      osVersion = ua.match(/Android ([\d.]+)/)?.[1];
    }
  } else if (ua.includes('iPhone') || ua.includes('iPad')) {
    os = 'iOS';
    osVersion = ua.match(/OS ([\d_]+)/)?.[1]?.replace(/_/g, '.');
  }

  return { type, os, osVersion };
}

/**
 * Get viewport information
 */
function getViewportInfo(): ViewportInfo {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
  };
}

/**
 * Get storage keys (cookie names, localStorage keys, sessionStorage keys)
 */
function getStorageKeys(): StorageKeys {
  const result: StorageKeys = {
    cookies: [],
    localStorage: [],
    sessionStorage: [],
  };

  // Get cookie names (not values for privacy)
  try {
    const cookieString = document.cookie;
    if (cookieString) {
      result.cookies = cookieString.split(';').map((cookie) => cookie.split('=')[0].trim());
    }
  } catch {
    // Cookies not accessible
  }

  // Get localStorage keys
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) result.localStorage.push(key);
    }
  } catch {
    // localStorage not accessible
  }

  // Get sessionStorage keys
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) result.sessionStorage.push(key);
    }
  } catch {
    // sessionStorage not accessible
  }

  return result;
}

/**
 * Get page load time from Performance API
 */
function getPageLoadTime(): number | undefined {
  try {
    const entries = performance.getEntriesByType('navigation');
    if (entries.length > 0) {
      const navEntry = entries[0] as PerformanceNavigationTiming;
      return Math.round(navEntry.loadEventEnd - navEntry.startTime);
    }
  } catch {
    // Performance API not available
  }
  return undefined;
}

/**
 * Capture all context information
 */
export function captureContext(options: CaptureContextOptions = {}): PageContext {
  const consoleCapture = options.consoleCapture ?? true;
  const networkCapture = options.networkCapture ?? true;
  const userActivityCapture = options.userActivityCapture ?? true;
  const storageKeysCapture = options.storageKeysCapture ?? true;
  return {
    url: window.location.href,
    title: document.title || undefined,
    referrer: document.referrer || undefined,
    browser: getBrowserInfo(),
    device: getDeviceInfo(),
    viewport: getViewportInfo(),
    timestamp: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    pageLoadTime: getPageLoadTime(),
    consoleErrors: consoleCapture && capturedErrors.length > 0 ? [...capturedErrors] : undefined,
    networkErrors:
      networkCapture && capturedNetworkErrors.length > 0 ? [...capturedNetworkErrors] : undefined,
    userActivity:
      userActivityCapture && capturedUserActivity.length > 0
        ? [...capturedUserActivity]
        : undefined,
    storageKeys: storageKeysCapture ? getStorageKeys() : undefined,
  };
}
