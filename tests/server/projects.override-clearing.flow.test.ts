import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { Hono } from '../../src/server/node_modules/hono';
import { config } from '../../src/server/config';
import {
  closeDatabase,
  initDatabase,
  initSchema,
  runMigrations,
} from '../../src/server/database/database';
import { projectsService } from '../../src/server/services/projects.service';
import { settingsCacheService } from '../../src/server/services/settings-cache.service';
import { widgetRoutes } from '../../src/server/routes/widget/submit';
import { logger } from '../../src/server/utils/logger';

const originalConfig = { ...config };
const originalLogger = { ...logger };
let tempDir = '';

interface WidgetConfigBody {
  config: {
    position: string;
    dialogLightButtonColor: string;
    maxScreenshotSizeMb: number;
    dialogShowPriority: boolean;
  };
}

async function widgetConfig(apiKey: string): Promise<WidgetConfigBody['config']> {
  const app = new Hono();
  app.route('/widget', widgetRoutes);
  const res = await app.request(`http://localhost/widget/config/${apiKey}`);
  expect(res.status).toBe(200);
  return ((await res.json()) as WidgetConfigBody).config;
}

beforeAll(async () => {
  logger.info = () => undefined;
  logger.warn = () => undefined;
  tempDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-project-overrides-'));
  Object.assign(config, { dataDir: tempDir, dbPath: path.join(tempDir, 'bugpin.db') });
  await initDatabase();
  await initSchema();
  await runMigrations();
  settingsCacheService.invalidate();
});

afterAll(() => {
  closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
  Object.assign(config, originalConfig);
  Object.assign(logger, originalLogger);
  settingsCacheService.invalidate();
});

describe('clearing project overrides', () => {
  it('falls back to the instance defaults once an override is set to null', async () => {
    const created = await projectsService.create({
      name: 'Overrides',
      settings: {
        widgetDialog: { lightButtonColor: '#111111' },
        widgetLauncherButton: { position: 'top-left' },
        widgetDialogContent: { showPriority: false },
        screenshot: { maxScreenshotSize: 5 },
      },
    });
    expect(created.success).toBe(true);
    if (!created.success) return;
    const project = created.value;

    const overridden = await widgetConfig(project.apiKey);
    expect(overridden.dialogLightButtonColor).toBe('#111111');
    expect(overridden.position).toBe('top-left');
    expect(overridden.dialogShowPriority).toBe(false);
    expect(overridden.maxScreenshotSizeMb).toBe(5);

    const updated = await projectsService.update(project.id, {
      settings: {
        widgetDialog: null,
        widgetLauncherButton: null,
        widgetDialogContent: null,
        screenshot: null,
      },
    });
    expect(updated.success).toBe(true);
    if (!updated.success) return;
    expect(updated.value.settings).toEqual({});

    const fallback = await widgetConfig(project.apiKey);
    expect(fallback.dialogLightButtonColor).toBe('#02658D');
    expect(fallback.position).toBe('bottom-right');
    expect(fallback.dialogShowPriority).toBe(true);
    expect(fallback.maxScreenshotSizeMb).toBe(10);
  });
});
