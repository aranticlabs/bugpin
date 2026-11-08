import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';

type Settings = Record<string, unknown>;

function isObject(value: unknown): value is Settings {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function merge(current: Settings, update: Settings): Settings {
  const next: Settings = { ...current };
  for (const [key, value] of Object.entries(update)) {
    const existing = next[key];
    next[key] = isObject(existing) && isObject(value) ? { ...existing, ...value } : value;
  }
  return next;
}

const baseSettings: Settings = {
  appName: 'BugPin',
  appUrl: 'https://bugpin.example.com',
  retentionDays: 90,
  rateLimitPerMinute: 10,
  sessionMaxAgeDays: 7,
  invitationExpirationDays: 7,
  updateCheckEnabled: true,
  enforceHttps: false,
  twoFactorPolicy: 'admins',
  passwordPolicy: {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: false,
    requireNumber: true,
    requireSymbol: false,
  },
  privacy: { euPrivacyMode: false },
  diagnostics: {
    activityCapture: true,
    consoleCapture: true,
    networkCapture: true,
    storageKeysCapture: false,
  },
  smtpEnabled: false,
  smtpConfig: { host: '', port: 587, user: '', from: '', passwordSet: false },
  s3Enabled: false,
  s3Config: { bucket: '', region: '', accessKeyId: '', endpoint: '', secretAccessKeySet: false },
  screenshot: {
    useScreenCaptureAPI: false,
    maxScreenshotSize: 5,
    maxImageUploadSizeMb: 10,
    maxVideoUploadSizeMb: 50,
    maxVideoUploadMbPerDay: 2048,
    enableScreenRecording: false,
    allowRecordingMicrophone: false,
    maxRecordingDurationSeconds: 180,
    recordingQuality: 'standard',
  },
  notifications: {
    emailEnabled: true,
    notifyOnNewReport: true,
    notifyOnStatusChange: true,
    notifyOnPriorityChange: true,
    notifyOnAssignment: true,
    notifyOnDeletion: true,
  },
  reporterNotifications: {
    emailEnabled: true,
    notifyOnNewReport: true,
    notifyOnStatusChange: true,
    notifyOnPriorityChange: true,
    notifyOnAssignment: true,
    messagingEnabled: true,
  },
  language: { mode: 'auto', defaultLanguage: 'en' },
};

/**
 * Serves settings like the real server: PUT merges nested objects into the stored settings and
 * answers with the complete result. Every PUT body is recorded in `puts`.
 */
export function mockSettingsServer(overrides: Settings = {}) {
  let stored = merge(baseSettings, overrides);
  let failures = 0;
  let afterPut: ((body: Settings) => void) | undefined;
  const puts: Settings[] = [];
  const control = {
    puts,
    /** Changes the stored settings as if another admin saved them. */
    update: (changes: Settings) => {
      stored = merge(stored, changes);
    },
    /** Lets the given number of following PUT requests fail. */
    failNext: (count = 1) => {
      failures = count;
    },
    /** Runs after every successful PUT, before the response is sent. */
    onPut: (callback: (body: Settings) => void) => {
      afterPut = callback;
    },
  };

  server.use(
    http.get('/api/settings', () => HttpResponse.json({ success: true, settings: stored })),
    http.put('/api/settings', async ({ request }) => {
      const body: unknown = await request.json();
      if (!isObject(body)) return HttpResponse.json({ success: false }, { status: 400 });
      puts.push(body);
      if (failures > 0) {
        failures -= 1;
        return HttpResponse.json(
          { success: false, error: 'VALIDATION_ERROR', message: 'Saving failed on the server' },
          { status: 400 }
        );
      }
      stored = merge(stored, body);
      afterPut?.(body);
      return HttpResponse.json({ success: true, settings: stored });
    })
  );

  return control;
}
