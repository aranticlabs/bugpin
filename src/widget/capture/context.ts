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

// Store console errors, network errors, and user activity
const capturedErrors: ConsoleError[] = [];
const capturedNetworkErrors: NetworkError[] = [];
const capturedUserActivity: UserActivity[] = [];
const MAX_ACTIVITY_ITEMS = 30;
let isCapturing = false;

/**
 * Start capturing console errors and network errors
 */
export function startErrorCapture(): void {
  if (isCapturing) return;
  isCapturing = true;

  // Capture console.error
  const originalError = console.error;
  console.error = (...args) => {
    capturedErrors.push({
      type: 'error',
      message: args.map((arg) => String(arg)).join(' '),
      timestamp: new Date().toISOString(),
    });
    originalError.apply(console, args);
  };

  // Capture console.warn
  const originalWarn = console.warn;
  console.warn = (...args) => {
    capturedErrors.push({
      type: 'warn',
      message: args.map((arg) => String(arg)).join(' '),
      timestamp: new Date().toISOString(),
    });
    originalWarn.apply(console, args);
  };

  // Capture window.onerror
  const originalOnError = window.onerror;
  window.onerror = (message, source, line, _column, _error) => {
    capturedErrors.push({
      type: 'error',
      message: String(message),
      source: source || undefined,
      line: line || undefined,
      timestamp: new Date().toISOString(),
    });
    if (originalOnError) {
      return originalOnError.apply(window, [message, source, line, _column, _error]);
    }
    return false;
  };

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    capturedErrors.push({
      type: 'error',
      message: `Unhandled Promise Rejection: ${String(event.reason)}`,
      timestamp: new Date().toISOString(),
    });
  });

  // Capture network errors via fetch
  const originalFetch = window.fetch.bind(window);
  (window as unknown as { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> }).fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
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
        capturedNetworkErrors.push({
          url,
          method,
          status: response.status,
          statusText: response.statusText,
          timestamp: new Date().toISOString(),
        });
      }
      return response;
    } catch (error) {
      // Capture network failures (e.g., CORS, network down, etc.)
      capturedNetworkErrors.push({
        url,
        method,
        status: 0,
        statusText: error instanceof Error ? error.message : 'Network Error',
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  };

  // Capture network errors via XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method: string, url: string | URL) {
    this._bugpinMethod = method;
    this._bugpinUrl = typeof url === 'string' ? url : url.href;
    return originalXHROpen.apply(this, arguments as unknown as Parameters<typeof originalXHROpen>);
  };

  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', function () {
      if (this.status >= 300) {
        capturedNetworkErrors.push({
          url: this._bugpinUrl || '',
          method: this._bugpinMethod || 'GET',
          status: this.status,
          statusText: this.statusText,
          timestamp: new Date().toISOString(),
        });
      }
    });
    return originalXHRSend.apply(this, arguments as unknown as Parameters<typeof originalXHRSend>);
  };

  // Track user clicks
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target as HTMLElement;
      if (!target) return;

      // Skip clicks on the BugPin widget itself
      if (target.closest('[data-bugpin-exclude]')) return;

      let activity: UserActivity | null = null;

      // Check for button
      if (target.tagName === 'BUTTON' || target.closest('button')) {
        const btn = target.tagName === 'BUTTON' ? target : target.closest('button')!;
        activity = {
          type: 'button',
          text: btn.textContent?.trim().slice(0, 50) || undefined,
          timestamp: new Date().toISOString(),
        };
      }
      // Check for link
      else if (target.tagName === 'A' || target.closest('a')) {
        const link = (target.tagName === 'A' ? target : target.closest('a')!) as HTMLAnchorElement;
        activity = {
          type: 'link',
          text: link.textContent?.trim().slice(0, 50) || undefined,
          url: link.href || undefined,
          timestamp: new Date().toISOString(),
        };
      }
      // Check for checkbox
      else if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
        const input = target as HTMLInputElement;
        activity = {
          type: 'checkbox',
          text: input.name || input.id || undefined,
          timestamp: new Date().toISOString(),
        };
      }
      // Check for other inputs
      else if (target.tagName === 'INPUT') {
        const input = target as HTMLInputElement;
        activity = {
          type: 'input',
          inputType: input.type || 'text',
          text: input.name || input.placeholder?.slice(0, 30) || undefined,
          timestamp: new Date().toISOString(),
        };
      }
      // Check for select
      else if (target.tagName === 'SELECT' || target.closest('[role="combobox"]')) {
        const select = target.tagName === 'SELECT' ? (target as HTMLSelectElement) : null;
        activity = {
          type: 'select',
          text: select?.name || undefined,
          timestamp: new Date().toISOString(),
        };
      }
      // Other elements (only track if they seem interactive)
      else if (
        target.onclick ||
        target.getAttribute('role') === 'button' ||
        target.classList.contains('btn') ||
        target.closest('[role="button"]')
      ) {
        activity = {
          type: 'other',
          text: target.textContent?.trim().slice(0, 50) || undefined,
          timestamp: new Date().toISOString(),
        };
      }

      if (activity) {
        addUserActivity(activity);
      }
    },
    true,
  );
}

/**
 * Add user activity to the trail (keeps last MAX_ACTIVITY_ITEMS)
 */
function addUserActivity(activity: UserActivity): void {
  capturedUserActivity.push(activity);
  if (capturedUserActivity.length > MAX_ACTIVITY_ITEMS) {
    capturedUserActivity.shift();
  }
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
export function captureContext(): PageContext {
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
    consoleErrors: capturedErrors.length > 0 ? [...capturedErrors] : undefined,
    networkErrors: capturedNetworkErrors.length > 0 ? [...capturedNetworkErrors] : undefined,
    userActivity: capturedUserActivity.length > 0 ? [...capturedUserActivity] : undefined,
    storageKeys: getStorageKeys(),
  };
}

// Note: startErrorCapture() is called from index.ts to ensure it runs
// immediately when the widget script loads, before any async operations.
