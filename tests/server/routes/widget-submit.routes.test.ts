import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../src/server/node_modules/hono/dist/index.js';
import { widgetRoutes } from '../../../src/server/routes/widget/submit';
import { projectsRepo } from '../../../src/server/database/repositories/projects.repo';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { reportsService } from '../../../src/server/services/reports.service';
import { settingsService } from '../../../src/server/services/settings.service';
import { filesRepo } from '../../../src/server/database/repositories/files.repo';
import {
  widgetPackageCompatibilityService,
  type WidgetVersionObservationInput,
} from '../../../src/server/services/widget-package-compatibility.service';
import { Result } from '../../../src/server/utils/result';
import { logger } from '../../../src/server/utils/logger';
import { MAX_REQUEST_BODY_SIZE } from '../../../src/server/utils/request-limits';
import type { Project, Report, AppSettings } from '../../../src/shared/types';

const baseProject: Project = {
  id: 'prj_1',
  name: 'Test Project',
  apiKey: 'test_api_key_123',
  settings: {
    security: {
      allowedOrigins: [],
    },
    branding: {},
    widgetLauncherButton: {},
    widgetDialog: {},
    screenshot: {},
  },
  reportsCount: 0,
  isActive: true,
  position: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseReport: Report = {
  id: 'rpt_1',
  projectId: 'prj_1',
  title: 'Bug Report',
  status: 'open',
  priority: 'medium',
  metadata: {
    url: 'https://example.com',
    browser: { name: 'Chrome', version: '120', userAgent: 'Mozilla/5.0' },
    device: { type: 'desktop', os: 'macOS' },
    viewport: { width: 1920, height: 1080, devicePixelRatio: 2 },
    timestamp: new Date().toISOString(),
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseSettings: Partial<AppSettings> = {
  rateLimitPerMinute: 60,
  branding: {
    primaryColor: '#000000',
  },
  widgetLauncherButton: {
    theme: 'system',
    position: 'bottom-right',
    buttonText: 'Report Bug',
    buttonShape: 'pill',
    buttonIcon: 'bug',
    buttonIconSize: 20,
    buttonIconStroke: 2,
    enableHoverScaleEffect: true,
    tooltipEnabled: true,
    tooltipText: 'Report a bug',
    lightButtonColor: '#000000',
    lightTextColor: '#ffffff',
    lightButtonHoverColor: '#333333',
    lightTextHoverColor: '#ffffff',
    darkButtonColor: '#ffffff',
    darkTextColor: '#000000',
    darkButtonHoverColor: '#cccccc',
    darkTextHoverColor: '#000000',
  },
  widgetDialog: {
    lightButtonColor: '#000000',
    lightTextColor: '#ffffff',
    lightButtonHoverColor: '#333333',
    lightTextHoverColor: '#ffffff',
    darkButtonColor: '#ffffff',
    darkTextColor: '#000000',
    darkButtonHoverColor: '#cccccc',
    darkTextHoverColor: '#000000',
  },
  screenshot: {
    useScreenCaptureAPI: false,
    maxScreenshotSize: 10,
    maxImageUploadSizeMb: 10,
    maxVideoUploadSizeMb: 50,
    maxVideoUploadMbPerDay: 2048,
    enableScreenRecording: false,
    allowRecordingMicrophone: false,
    maxRecordingDurationSeconds: 180,
  },
  language: {
    mode: 'auto',
    defaultLanguage: 'en',
  },
};

const originalProjectsRepo = { ...projectsRepo };
const originalSettingsRepo = { ...settingsRepo };
const originalReportsService = { ...reportsService };
const originalSettingsService = { ...settingsService };
const originalFilesRepo = { ...filesRepo };
const originalWidgetPackageCompatibilityService = { ...widgetPackageCompatibilityService };
const originalLogger = { ...logger };

let projectResult: Project | null = baseProject;
let observedWidgetVersions: WidgetVersionObservationInput[] = [];
let warningMessages: string[] = [];

beforeEach(() => {
  projectResult = baseProject;
  observedWidgetVersions = [];
  warningMessages = [];

  // Invalidate settings cache so mocked settingsRepo.getAll takes effect
  settingsCacheService.invalidate();

  projectsRepo.findByApiKey = async () => projectResult;
  settingsRepo.getAll = async () => baseSettings as AppSettings;
  reportsService.create = async () => Result.ok(baseReport);
  filesRepo.getVideoSizeByProjectSince = () => 0;
  widgetPackageCompatibilityService.observe = async (input) => {
    observedWidgetVersions.push(input);
    return Result.ok(undefined);
  };

  logger.info = () => undefined;
  logger.warn = (message) => {
    warningMessages.push(message);
  };
  logger.error = () => undefined;
  logger.debug = () => undefined;
});

afterEach(() => {
  Object.assign(projectsRepo, originalProjectsRepo);
  Object.assign(settingsRepo, originalSettingsRepo);
  Object.assign(reportsService, originalReportsService);
  Object.assign(settingsService, originalSettingsService);
  Object.assign(filesRepo, originalFilesRepo);
  Object.assign(widgetPackageCompatibilityService, originalWidgetPackageCompatibilityService);
  Object.assign(logger, originalLogger);
});

function createApp() {
  const app = new Hono();
  app.route('/widget', widgetRoutes);
  return app;
}

const validSubmitBody = {
  title: 'Test Bug Report',
  description: 'This is a test bug report',
  priority: 'medium',
  metadata: {
    url: 'https://example.com',
    browser: { name: 'Chrome', version: '120', userAgent: 'Mozilla/5.0' },
    device: { type: 'desktop', os: 'macOS' },
    viewport: { width: 1920, height: 1080, devicePixelRatio: 2 },
    timestamp: new Date().toISOString(),
  },
};

function createVideoSubmitForm(
  size = 8,
  mimeType = 'video/mp4',
  filename = 'clip.mp4',
  signature = [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70],
  field: 'media' | 'recording' = 'media'
): FormData {
  const bytes = new Uint8Array(size);
  bytes.set(signature);
  const form = new FormData();
  form.set('data', JSON.stringify(validSubmitBody));
  form.set(field, new File([bytes], filename, { type: mimeType }));
  return form;
}

describe('widget submit request body limit', () => {
  const MB = 1024 * 1024;

  async function submitThroughServer(form: FormData): Promise<Response> {
    const server = Bun.serve({
      port: 0,
      maxRequestBodySize: MAX_REQUEST_BODY_SIZE,
      fetch: createApp().fetch,
    });
    try {
      return await fetch(`http://localhost:${server.port}/widget/submit`, {
        method: 'POST',
        headers: { 'x-api-key': 'test_api_key_123' },
        body: form,
      });
    } finally {
      server.stop(true);
    }
  }

  beforeEach(() => {
    projectResult = {
      ...baseProject,
      settings: {
        ...baseProject.settings,
        screenshot: { maxVideoUploadSizeMb: 100, maxScreenshotSize: 50, maxImageUploadSizeMb: 50 },
      },
    };
  });

  it('covers one maximum-size video and three maximum-size images', () => {
    expect(MAX_REQUEST_BODY_SIZE).toBeGreaterThanOrEqual((100 + 3 * 50) * MB);
  });

  it('accepts a maximum-size video with a large screenshot', async () => {
    let fileSizes: number[] = [];
    reportsService.create = async (input) => {
      fileSizes = input.files?.map((file) => file.data.byteLength) ?? [];
      return Result.ok(baseReport);
    };
    const form = createVideoSubmitForm(100 * MB);
    const image = new Uint8Array(30 * MB);
    image.set([0x89, 0x50, 0x4e, 0x47]);
    form.append('media', new File([image], 'screenshot.png', { type: 'image/png' }));

    const res = await submitThroughServer(form);

    expect(res.status).toBe(201);
    expect(fileSizes).toEqual([100 * MB, 30 * MB]);
  });

  it('answers an oversized video with a structured error', async () => {
    const res = await submitThroughServer(createVideoSubmitForm(100 * MB + 1));

    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({
      success: false,
      error: 'FILE_TOO_LARGE',
      details: { kind: 'video', limit: 100 * MB },
    });
  });
});

describe('widget submit idle timeout', () => {
  function createTimeoutEnv() {
    const timeouts: number[] = [];
    return {
      timeouts,
      env: {
        timeout: (_request: Request, seconds: number) => {
          timeouts.push(seconds);
        },
      },
    };
  }

  it('keeps the server idle timeout for requests without a valid API key', async () => {
    const { env, timeouts } = createTimeoutEnv();

    const res = await createApp().request(
      'http://localhost/widget/submit',
      {
        method: 'POST',
        body: createVideoSubmitForm(
          8,
          'video/webm',
          'rec.webm',
          [0x1a, 0x45, 0xdf, 0xa3],
          'recording'
        ),
      },
      env
    );

    expect(res.status).toBe(401);
    expect(timeouts).toEqual([]);
  });

  it('keeps the server idle timeout for reports without a recording', async () => {
    const { env, timeouts } = createTimeoutEnv();

    const res = await createApp().request(
      'http://localhost/widget/submit',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': 'test_api_key_123' },
        body: JSON.stringify(validSubmitBody),
      },
      env
    );

    expect(res.status).toBe(201);
    expect(timeouts).toEqual([]);
  });

  it('extends the idle timeout to a finite bound once a recording has been received', async () => {
    const { env, timeouts } = createTimeoutEnv();

    await createApp().request(
      'http://localhost/widget/submit',
      {
        method: 'POST',
        headers: { 'x-api-key': 'test_api_key_123' },
        body: createVideoSubmitForm(
          8,
          'video/webm',
          'rec.webm',
          [0x1a, 0x45, 0xdf, 0xa3],
          'recording'
        ),
      },
      env
    );

    expect(timeouts).toEqual([255]);
  });
});

describe('widget routes', () => {
  describe('POST /widget/submit', () => {
    it('returns 401 when API key is missing', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/widget/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validSubmitBody),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('UNAUTHORIZED');
    });

    it('returns 401 when API key is invalid', async () => {
      projectResult = null;

      const app = createApp();
      const res = await app.request('http://localhost/widget/submit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'invalid_key',
        },
        body: JSON.stringify(validSubmitBody),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.message).toBe('Invalid API key');
    });

    it('accepts API key from header', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/widget/submit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'test_api_key_123',
        },
        body: JSON.stringify(validSubmitBody),
      });

      expect(res.status).toBe(201);
    });

    it('rejects deprecated API key query param', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/widget/submit?apiKey=test_api_key_123', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validSubmitBody),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('DEPRECATED');
    });

    it('returns 403 when origin is not allowed', async () => {
      projectResult = {
        ...baseProject,
        settings: {
          ...baseProject.settings,
          security: {
            allowedOrigins: ['allowed.com'],
          },
        },
      };

      const app = createApp();
      const res = await app.request('http://localhost/widget/submit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'test_api_key_123',
          origin: 'https://not-allowed.com',
        },
        body: JSON.stringify(validSubmitBody),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('ORIGIN_NOT_ALLOWED');
    });

    it('allows request when origin matches allowed domain', async () => {
      projectResult = {
        ...baseProject,
        settings: {
          ...baseProject.settings,
          security: {
            allowedOrigins: ['example.com'],
          },
        },
      };

      const app = createApp();
      const res = await app.request('http://localhost/widget/submit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'test_api_key_123',
          origin: 'https://example.com',
        },
        body: JSON.stringify(validSubmitBody),
      });

      expect(res.status).toBe(201);
    });

    it('allows request when origin matches subdomain', async () => {
      projectResult = {
        ...baseProject,
        settings: {
          ...baseProject.settings,
          security: {
            allowedOrigins: ['example.com'],
          },
        },
      };

      const app = createApp();
      const res = await app.request('http://localhost/widget/submit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'test_api_key_123',
          origin: 'https://sub.example.com',
        },
        body: JSON.stringify(validSubmitBody),
      });

      expect(res.status).toBe(201);
    });

    it('returns 400 when validation fails', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/widget/submit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'test_api_key_123',
        },
        body: JSON.stringify({
          title: 'ab', // Too short
          metadata: {},
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    it('creates report successfully', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/widget/submit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'test_api_key_123',
        },
        body: JSON.stringify(validSubmitBody),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.reportId).toBe('rpt_1');
    });

    it('answers a repeated submission with the existing report instead of a new one', async () => {
      const created: string[] = [];
      const stored = new Map<string, string>();
      reportsService.findIdByWidgetSubmission = (projectId, submissionId) =>
        stored.get(`${projectId}:${submissionId}`) ?? null;
      reportsService.create = async (input) => {
        // Slow enough that the retry arrives while the first request is still running
        await new Promise((resolve) => setTimeout(resolve, 20));
        const id = `rpt_${created.length + 1}`;
        created.push(id);
        if (input.submissionId) stored.set(`prj_1:${input.submissionId}`, id);
        return Result.ok({ ...baseReport, id });
      };

      const app = createApp();
      const submit = () =>
        app.request('http://localhost/widget/submit', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': 'test_api_key_123' },
          body: JSON.stringify({ ...validSubmitBody, submissionId: 'sub_0123456789' }),
        });

      const responses = await Promise.all([submit(), submit()]);
      expect(responses.map((res) => res.status).sort()).toEqual([200, 201]);
      const retry = responses.find((res) => res.status === 200);
      expect(await retry?.json()).toMatchObject({
        success: true,
        reportId: 'rpt_1',
        duplicate: true,
      });
      expect(created).toEqual(['rpt_1']);

      const later = await submit();
      expect(later.status).toBe(200);
      expect(created).toEqual(['rpt_1']);
    });

    it('rejects a malformed submission id', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/widget/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': 'test_api_key_123' },
        body: JSON.stringify({ ...validSubmitBody, submissionId: 'bad id' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when service fails', async () => {
      reportsService.create = async () => Result.fail('Creation failed', 'CREATE_ERROR');

      const app = createApp();
      const res = await app.request('http://localhost/widget/submit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'test_api_key_123',
        },
        body: JSON.stringify(validSubmitBody),
      });

      expect(res.status).toBe(400);
    });

    it('normalizes recorded video MIME parameters before validation and persistence', async () => {
      let submittedMimeType: string | undefined;
      reportsService.create = async (input) => {
        submittedMimeType = input.files?.[0]?.mimeType;
        return Result.ok(baseReport);
      };

      const res = await createApp().request('http://localhost/widget/submit', {
        method: 'POST',
        headers: { 'x-api-key': 'test_api_key_123' },
        body: createVideoSubmitForm(8, 'video/mp4; codecs=avc1.42000a'),
      });

      expect(res.status).toBe(201);
      expect(submittedMimeType).toBe('video/mp4');
    });

    it('accepts uploaded MOV videos while screen recording is disabled', async () => {
      let submittedMimeType: string | undefined;
      reportsService.create = async (input) => {
        submittedMimeType = input.files?.[0]?.mimeType;
        return Result.ok(baseReport);
      };

      const res = await createApp().request('http://localhost/widget/submit', {
        method: 'POST',
        headers: { 'x-api-key': 'test_api_key_123' },
        body: createVideoSubmitForm(8, 'video/quicktime', 'clip.mov'),
      });

      expect(res.status).toBe(201);
      expect(submittedMimeType).toBe('video/quicktime');
    });

    it('accepts WebM uploads with an EBML signature', async () => {
      let submittedFile: { mimeType: string; data: Buffer | Uint8Array } | undefined;
      reportsService.create = async (input) => {
        submittedFile = input.files?.[0];
        return Result.ok(baseReport);
      };

      const res = await createApp().request('http://localhost/widget/submit', {
        method: 'POST',
        headers: { 'x-api-key': 'test_api_key_123' },
        body: createVideoSubmitForm(8, 'video/webm', 'clip.webm', [0x1a, 0x45, 0xdf, 0xa3]),
      });

      expect(res.status).toBe(201);
      expect(submittedFile?.mimeType).toBe('video/webm');
      expect(Array.from(submittedFile?.data.slice(0, 4) ?? [])).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    });

    it('marks only files from the recording field for remuxing', async () => {
      projectResult = {
        ...baseProject,
        settings: {
          ...baseProject.settings,
          screenshot: { enableScreenRecording: true },
        },
      };
      let submittedFiles: Array<{ filename: string; isRecording?: boolean }> = [];
      reportsService.create = async (input) => {
        submittedFiles =
          input.files?.map(({ filename, isRecording }) => ({ filename, isRecording })) ?? [];
        return Result.ok(baseReport);
      };

      const mp4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]);
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const form = new FormData();
      form.set('data', JSON.stringify(validSubmitBody));
      form.append('media', new File([mp4], 'upload.mp4', { type: 'video/mp4' }));
      form.append('recording', new File([mp4], 'recording-1.mp4', { type: 'video/mp4' }));
      form.append('recording', new File([mp4], 'recording-2.mp4', { type: 'video/mp4' }));
      form.append('screenshot', new File([png], 'legacy.png', { type: 'image/png' }));

      const res = await createApp().request('http://localhost/widget/submit', {
        method: 'POST',
        headers: { 'x-api-key': 'test_api_key_123' },
        body: form,
      });

      expect(res.status).toBe(201);
      expect(submittedFiles).toEqual([
        { filename: 'upload.mp4', isRecording: false },
        { filename: 'recording-1.mp4', isRecording: true },
        { filename: 'recording-2.mp4', isRecording: true },
        { filename: 'legacy.png', isRecording: false },
      ]);
    });

    it('rejects recording fields while screen recording is disabled', async () => {
      const form = new FormData();
      form.set('data', JSON.stringify(validSubmitBody));
      form.set(
        'recording',
        new File([new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70])], 'recording.mp4', {
          type: 'video/mp4',
        })
      );

      const res = await createApp().request('http://localhost/widget/submit', {
        method: 'POST',
        headers: { 'x-api-key': 'test_api_key_123' },
        body: form,
      });

      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: 'SCREEN_RECORDING_DISABLED' });
    });

    it('rejects video when the project daily quota would be exceeded', async () => {
      projectResult = {
        ...baseProject,
        settings: {
          ...baseProject.settings,
          screenshot: { maxVideoUploadMbPerDay: 1 },
        },
      };
      filesRepo.getVideoSizeByProjectSince = () => 1024 * 1024;
      let createCalled = false;
      reportsService.create = async () => {
        createCalled = true;
        return Result.ok(baseReport);
      };

      const res = await createApp().request('http://localhost/widget/submit', {
        method: 'POST',
        headers: { 'x-api-key': 'test_api_key_123' },
        body: createVideoSubmitForm(),
      });

      expect(res.status).toBe(429);
      expect((await res.json()).error).toBe('VIDEO_QUOTA_EXCEEDED');
      expect(createCalled).toBe(false);
    });

    it('does not check video usage when the project quota is disabled', async () => {
      projectResult = {
        ...baseProject,
        settings: {
          ...baseProject.settings,
          screenshot: { maxVideoUploadMbPerDay: 0 },
        },
      };
      let quotaChecked = false;
      filesRepo.getVideoSizeByProjectSince = () => {
        quotaChecked = true;
        return Number.MAX_SAFE_INTEGER;
      };

      const res = await createApp().request('http://localhost/widget/submit', {
        method: 'POST',
        headers: { 'x-api-key': 'test_api_key_123' },
        body: createVideoSubmitForm(),
      });

      expect(res.status).toBe(201);
      expect(quotaChecked).toBe(false);
    });

    it('counts in-flight video uploads against the project quota', async () => {
      projectResult = {
        ...baseProject,
        settings: {
          ...baseProject.settings,
          screenshot: { maxVideoUploadMbPerDay: 1 },
        },
      };
      filesRepo.getVideoSizeByProjectSince = () => 0;

      let releaseFirst: (() => void) | undefined;
      let markFirstStarted: (() => void) | undefined;
      const firstStarted = new Promise<void>((resolve) => {
        markFirstStarted = resolve;
      });
      const firstCanFinish = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      reportsService.create = async () => {
        markFirstStarted?.();
        await firstCanFinish;
        return Result.ok(baseReport);
      };

      const app = createApp();
      const firstResponse = app.request('http://localhost/widget/submit', {
        method: 'POST',
        headers: { 'x-api-key': 'test_api_key_123' },
        body: createVideoSubmitForm(700 * 1024),
      });
      await firstStarted;

      const secondResponse = await app.request('http://localhost/widget/submit', {
        method: 'POST',
        headers: { 'x-api-key': 'test_api_key_123' },
        body: createVideoSubmitForm(700 * 1024),
      });
      releaseFirst?.();

      expect(secondResponse.status).toBe(429);
      expect((await firstResponse).status).toBe(201);
    });

    it('allows uploads that exactly reach the project quota', async () => {
      projectResult = {
        ...baseProject,
        settings: {
          ...baseProject.settings,
          screenshot: { maxVideoUploadMbPerDay: 1 },
        },
      };
      filesRepo.getVideoSizeByProjectSince = () => 512 * 1024;

      const res = await createApp().request('http://localhost/widget/submit', {
        method: 'POST',
        headers: { 'x-api-key': 'test_api_key_123' },
        body: createVideoSubmitForm(512 * 1024),
      });

      expect(res.status).toBe(201);
    });

    it('releases reserved quota when report preparation throws', async () => {
      projectResult = {
        ...baseProject,
        settings: {
          ...baseProject.settings,
          screenshot: { maxVideoUploadMbPerDay: 1 },
        },
      };
      filesRepo.getVideoSizeByProjectSince = () => 0;
      settingsService.getAll = async () => {
        throw new Error('database unavailable');
      };

      const first = await createApp().request('http://localhost/widget/submit', {
        method: 'POST',
        headers: { 'x-api-key': 'test_api_key_123' },
        body: createVideoSubmitForm(700 * 1024),
      });
      expect(first.status).toBe(500);

      settingsService.getAll = async () => Result.ok(baseSettings as AppSettings);
      const second = await createApp().request('http://localhost/widget/submit', {
        method: 'POST',
        headers: { 'x-api-key': 'test_api_key_123' },
        body: createVideoSubmitForm(700 * 1024),
      });

      expect(second.status).toBe(201);
    });

    it('removes user activity when EU Privacy Mode disables capture', async () => {
      settingsRepo.getAll = async () =>
        ({
          ...baseSettings,
          privacy: {
            euPrivacyMode: true,
          },
        }) as AppSettings;
      settingsCacheService.invalidate();

      let capturedMetadata: Report['metadata'] | undefined;
      reportsService.create = async (input) => {
        capturedMetadata = input.metadata;
        return Result.ok(baseReport);
      };

      const app = createApp();
      const res = await app.request('http://localhost/widget/submit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'test_api_key_123',
        },
        body: JSON.stringify({
          ...validSubmitBody,
          metadata: {
            ...validSubmitBody.metadata,
            userActivity: [
              {
                type: 'button',
                text: 'Save',
                timestamp: new Date().toISOString(),
              },
            ],
          },
        }),
      });

      expect(res.status).toBe(201);
      expect(capturedMetadata?.userActivity).toBeUndefined();
    });

    it('keeps activity when EU Privacy Mode is off', async () => {
      settingsRepo.getAll = async () =>
        ({
          ...baseSettings,
          privacy: {
            euPrivacyMode: false,
          },
        }) as AppSettings;
      settingsCacheService.invalidate();

      let capturedMetadata: Report['metadata'] | undefined;
      reportsService.create = async (input) => {
        capturedMetadata = input.metadata;
        return Result.ok(baseReport);
      };

      const activity = {
        type: 'button' as const,
        text: 'Save',
        timestamp: new Date().toISOString(),
      };
      const app = createApp();
      const res = await app.request('http://localhost/widget/submit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'test_api_key_123',
        },
        body: JSON.stringify({
          ...validSubmitBody,
          metadata: {
            ...validSubmitBody.metadata,
            userActivity: [activity],
          },
        }),
      });

      expect(res.status).toBe(201);
      expect(capturedMetadata?.userActivity).toEqual([activity]);
    });

    describe('reporter locale capture', () => {
      it('persists the normalized claimed locale for an auto-mode project', async () => {
        projectResult = {
          ...baseProject,
          settings: {
            ...baseProject.settings,
            language: { mode: 'auto', defaultLanguage: 'en' },
          },
        };

        let capturedLocale: string | undefined;
        reportsService.create = async (input) => {
          capturedLocale = input.reporterLocale;
          return Result.ok(baseReport);
        };

        const app = createApp();
        const res = await app.request('http://localhost/widget/submit', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': 'test_api_key_123',
          },
          body: JSON.stringify({ ...validSubmitBody, locale: 'fr-FR' }),
        });

        expect(res.status).toBe(201);
        expect(capturedLocale).toBe('fr');
      });

      it('overwrites the claimed locale with the project default in manual mode', async () => {
        projectResult = {
          ...baseProject,
          settings: {
            ...baseProject.settings,
            language: { mode: 'manual', defaultLanguage: 'de' },
          },
        };

        let capturedLocale: string | undefined;
        reportsService.create = async (input) => {
          capturedLocale = input.reporterLocale;
          return Result.ok(baseReport);
        };

        const app = createApp();
        const res = await app.request('http://localhost/widget/submit', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': 'test_api_key_123',
          },
          body: JSON.stringify({ ...validSubmitBody, locale: 'fr' }),
        });

        expect(res.status).toBe(201);
        expect(capturedLocale).toBe('de');
      });

      it('falls back to project default when claimed locale is unsupported in auto mode', async () => {
        projectResult = {
          ...baseProject,
          settings: {
            ...baseProject.settings,
            language: { mode: 'auto', defaultLanguage: 'es' },
          },
        };

        let capturedLocale: string | undefined;
        reportsService.create = async (input) => {
          capturedLocale = input.reporterLocale;
          return Result.ok(baseReport);
        };

        const app = createApp();
        const res = await app.request('http://localhost/widget/submit', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': 'test_api_key_123',
          },
          body: JSON.stringify({ ...validSubmitBody, locale: 'pt-BR' }),
        });

        expect(res.status).toBe(201);
        expect(capturedLocale).toBe('es');
      });

      it('falls back to en when no language block exists and no claimed locale', async () => {
        projectResult = {
          ...baseProject,
          settings: { ...baseProject.settings },
        };

        let capturedLocale: string | undefined;
        reportsService.create = async (input) => {
          capturedLocale = input.reporterLocale;
          return Result.ok(baseReport);
        };

        const app = createApp();
        const res = await app.request('http://localhost/widget/submit', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': 'test_api_key_123',
          },
          body: JSON.stringify(validSubmitBody),
        });

        expect(res.status).toBe(201);
        expect(capturedLocale).toBe('en');
      });

      it('uses the global language when the project has no override', async () => {
        projectResult = { ...baseProject, settings: {} };
        settingsRepo.getAll = async () =>
          ({
            ...baseSettings,
            language: { mode: 'manual', defaultLanguage: 'de' },
          }) as AppSettings;

        let capturedLocale: string | undefined;
        reportsService.create = async (input) => {
          capturedLocale = input.reporterLocale;
          return Result.ok(baseReport);
        };

        const app = createApp();
        const res = await app.request('http://localhost/widget/submit', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': 'test_api_key_123',
          },
          body: JSON.stringify({ ...validSubmitBody, locale: 'fr' }),
        });

        expect(res.status).toBe(201);
        expect(capturedLocale).toBe('de');
      });
    });
  });

  describe('GET /widget/config/:apiKey', () => {
    it('records valid npm package metadata without changing the response', async () => {
      const app = createApp();
      const res = await app.request(
        'http://localhost/widget/config/test_api_key_123?widgetVersion=1.1.3&integration=npm',
        {
          headers: {
            origin: 'https://app.example.com',
            referer: 'https://app.example.com/account',
          },
        }
      );
      await Promise.resolve();

      expect(res.status).toBe(200);
      expect(observedWidgetVersions).toEqual([
        {
          projectId: 'prj_1',
          version: '1.1.3',
          origin: 'https://app.example.com',
          referer: 'https://app.example.com/account',
        },
      ]);
    });

    it('ignores hosted, missing, malformed, oversized, and unsupported metadata', async () => {
      const app = createApp();
      const urls = [
        'http://localhost/widget/config/test_api_key_123',
        'http://localhost/widget/config/test_api_key_123?integration=npm',
        'http://localhost/widget/config/test_api_key_123?widgetVersion=1.1&integration=npm',
        `http://localhost/widget/config/test_api_key_123?widgetVersion=${'1'.repeat(33)}&integration=npm`,
        'http://localhost/widget/config/test_api_key_123?widgetVersion=1.1.3&integration=hosted',
      ];

      for (const url of urls) {
        const res = await app.request(url);
        expect(res.status).toBe(200);
      }
      await Promise.resolve();

      expect(observedWidgetVersions).toEqual([]);
    });

    it('logs persistence failures without changing widget configuration', async () => {
      widgetPackageCompatibilityService.observe = async () =>
        Result.fail('database unavailable', 'OBSERVATION_ERROR');

      const app = createApp();
      const res = await app.request(
        'http://localhost/widget/config/test_api_key_123?widgetVersion=1.1.3&integration=npm'
      );
      const body = await res.json();
      await Promise.resolve();

      expect(res.status).toBe(200);
      expect(body.config.projectName).toBe('Test Project');
      expect(warningMessages).toContain('Failed to record widget package version');
    });

    it('returns automatic activity capture when EU Privacy Mode is off', async () => {
      settingsRepo.getAll = async () =>
        ({
          ...baseSettings,
          privacy: {
            euPrivacyMode: false,
          },
        }) as AppSettings;

      const app = createApp();
      const res = await app.request('http://localhost/widget/config/test_api_key_123');
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.config.features.userActivityCapture).toBe('automatic');
      expect(body.config.features.storageKeysCapture).toBe(false);
    });

    it('returns disabled activity capture for EU Privacy Mode', async () => {
      settingsRepo.getAll = async () =>
        ({
          ...baseSettings,
          privacy: {
            euPrivacyMode: true,
          },
        }) as AppSettings;

      const app = createApp();
      const disabledResponse = await app.request('http://localhost/widget/config/test_api_key_123');
      const disabledBody = await disabledResponse.json();
      expect(disabledBody.config.features.userActivityCapture).toBe('disabled');
    });

    it('returns 404 when project not found', async () => {
      projectResult = null;

      const app = createApp();
      const res = await app.request('http://localhost/widget/config/invalid_key');

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('INVALID_API_KEY');
    });

    it('returns widget config', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/widget/config/test_api_key_123');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.config.projectName).toBe('Test Project');
      expect(body.config.features).toBeDefined();
      expect(body.config.theme).toBeDefined();
      expect(body.config.position).toBeDefined();
      expect(body.config.features.screenRecording).toBe(false);
      expect(body.config.features.recordingMicrophone).toBe(false);
      expect(body.config.maxRecordingDurationSeconds).toBe(180);
    });

    it('resolves project screen recording settings over global settings', async () => {
      projectResult = {
        ...baseProject,
        settings: {
          ...baseProject.settings,
          screenshot: {
            enableScreenRecording: true,
            allowRecordingMicrophone: true,
            maxRecordingDurationSeconds: 90,
          },
        },
      };

      const res = await createApp().request('http://localhost/widget/config/test_api_key_123');
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.config.features.screenRecording).toBe(true);
      expect(body.config.features.recordingMicrophone).toBe(true);
      expect(body.config.maxRecordingDurationSeconds).toBe(90);
    });

    it('returns project-specific settings when available', async () => {
      projectResult = {
        ...baseProject,
        settings: {
          ...baseProject.settings,
          widgetLauncherButton: {
            theme: 'dark',
            position: 'bottom-left',
            buttonText: { en: 'Custom Text' },
          },
        },
      };

      const app = createApp();
      const res = await app.request('http://localhost/widget/config/test_api_key_123');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.config.theme).toBe('dark');
      expect(body.config.position).toBe('bottom-left');
      expect(body.config.buttonText.project).toEqual({ en: 'Custom Text' });
    });

    it('preserves explicit null for nullable fields in project settings', async () => {
      projectResult = {
        ...baseProject,
        settings: {
          ...baseProject.settings,
          widgetLauncherButton: {
            buttonIcon: null,
            buttonText: null,
            tooltipText: null,
          },
        },
      };

      const app = createApp();
      const res = await app.request('http://localhost/widget/config/test_api_key_123');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.config.buttonIcon).toBeNull();
      expect(body.config.buttonText.project).toBeNull();
      expect(body.config.tooltipText.project).toBeNull();
    });

    it('falls back to global settings when project settings not set', async () => {
      projectResult = {
        ...baseProject,
        settings: {},
      };
      settingsRepo.getAll = async () =>
        ({
          ...baseSettings,
          screenshot: {
            ...baseSettings.screenshot,
            enableScreenRecording: true,
            allowRecordingMicrophone: true,
            maxRecordingDurationSeconds: 240,
          },
        }) as AppSettings;

      const app = createApp();
      const res = await app.request('http://localhost/widget/config/test_api_key_123');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.config.theme).toBe('system');
      expect(body.config.position).toBe('bottom-right');
      expect(body.config.features.screenRecording).toBe(true);
      expect(body.config.features.recordingMicrophone).toBe(true);
      expect(body.config.maxRecordingDurationSeconds).toBe(240);
    });

    it('exposes the global language block when project has no override', async () => {
      projectResult = { ...baseProject, settings: {} };
      settingsRepo.getAll = async () =>
        ({
          ...baseSettings,
          language: { mode: 'manual', defaultLanguage: 'de' },
        }) as AppSettings;

      const app = createApp();
      const res = await app.request('http://localhost/widget/config/test_api_key_123');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.config.language).toEqual({ mode: 'manual', defaultLanguage: 'de' });
    });

    it('treats a cleared (null) project language as no override', async () => {
      projectResult = { ...baseProject, settings: { language: null } };
      settingsRepo.getAll = async () =>
        ({
          ...baseSettings,
          language: { mode: 'auto', defaultLanguage: 'fr' },
        }) as AppSettings;

      const app = createApp();
      const res = await app.request('http://localhost/widget/config/test_api_key_123');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.config.language).toEqual({ mode: 'auto', defaultLanguage: 'fr' });
    });

    it('exposes configured language block when project has one', async () => {
      projectResult = {
        ...baseProject,
        settings: {
          ...baseProject.settings,
          language: { mode: 'manual', defaultLanguage: 'de' },
        },
      };

      const app = createApp();
      const res = await app.request('http://localhost/widget/config/test_api_key_123');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.config.language).toEqual({ mode: 'manual', defaultLanguage: 'de' });
    });
  });
});
