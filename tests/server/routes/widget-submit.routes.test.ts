import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../src/server/node_modules/hono/dist/index.js';
import { widgetRoutes } from '../../../src/server/routes/widget/submit';
import { projectsRepo } from '../../../src/server/database/repositories/projects.repo';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { reportsService } from '../../../src/server/services/reports.service';
import { Result } from '../../../src/server/utils/result';
import { logger } from '../../../src/server/utils/logger';
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
  },
  language: {
    mode: 'auto',
    defaultLanguage: 'en',
  },
};

const originalProjectsRepo = { ...projectsRepo };
const originalSettingsRepo = { ...settingsRepo };
const originalReportsService = { ...reportsService };
const originalLogger = { ...logger };

let projectResult: Project | null = baseProject;

beforeEach(() => {
  projectResult = baseProject;

  // Invalidate settings cache so mocked settingsRepo.getAll takes effect
  settingsCacheService.invalidate();

  projectsRepo.findByApiKey = async () => projectResult;
  settingsRepo.getAll = async () => baseSettings as AppSettings;
  reportsService.create = async () => Result.ok(baseReport);

  logger.info = () => undefined;
  logger.warn = () => undefined;
  logger.error = () => undefined;
  logger.debug = () => undefined;
});

afterEach(() => {
  Object.assign(projectsRepo, originalProjectsRepo);
  Object.assign(settingsRepo, originalSettingsRepo);
  Object.assign(reportsService, originalReportsService);
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
    });
  });

  describe('GET /widget/config/:apiKey', () => {
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

      const app = createApp();
      const res = await app.request('http://localhost/widget/config/test_api_key_123');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.config.theme).toBe('system');
      expect(body.config.position).toBe('bottom-right');
    });

    it('exposes default language block when project has none', async () => {
      projectResult = {
        ...baseProject,
        settings: {},
      };

      const app = createApp();
      const res = await app.request('http://localhost/widget/config/test_api_key_123');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.config.language).toEqual({ mode: 'auto', defaultLanguage: 'en' });
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
