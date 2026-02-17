import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../../src/server/node_modules/hono/dist/index.js';
import { widgetRoutes } from '../../../../src/server/routes/widget/submit';
import { projectsRepo } from '../../../../src/server/database/repositories/projects.repo';
import { settingsRepo } from '../../../../src/server/database/repositories/settings.repo';
import { settingsCacheService } from '../../../../src/server/services/settings-cache.service';
import { reportsService } from '../../../../src/server/services/reports.service';
import { Result } from '../../../../src/server/utils/result';
import { logger } from '../../../../src/server/utils/logger';
import type { Project, Report, AppSettings } from '../../../../src/shared/types';

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
  });

  describe('GET /widget/config/:apiKey', () => {
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
            buttonText: 'Custom Text',
          },
        },
      };

      const app = createApp();
      const res = await app.request('http://localhost/widget/config/test_api_key_123');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.config.theme).toBe('dark');
      expect(body.config.position).toBe('bottom-left');
      expect(body.config.buttonText).toBe('Custom Text');
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
  });
});
