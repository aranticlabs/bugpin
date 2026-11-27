import { afterEach, beforeEach, expect, it } from 'bun:test';
import type { Hono } from 'hono';
import { getEELicenseService } from '../../../src/server/utils/ee';
import {
  DEFAULT_ADMIN_BUTTON,
  settingsRepo,
} from '../../../src/server/database/repositories/settings.repo';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import type { AdminButtonColors } from '../../../src/shared/types';
import { createPortalTestApp, openPortalDatabase, portalOrigin } from './helpers';

const licenseService = getEELicenseService()!;
const originalHasFeature = licenseService.hasFeature;
const custom: AdminButtonColors = {
  lightButtonColor: '#7c3aed',
  lightTextColor: '#ffffff',
  lightButtonHoverColor: '#6d28d9',
  lightTextHoverColor: '#ffffff',
  darkButtonColor: '#c4b5fd',
  darkTextColor: '#1e1b4b',
  darkButtonHoverColor: '#ddd6fe',
  darkTextHoverColor: '#1e1b4b',
};

let close: () => void;
let app: Hono;

beforeEach(async () => {
  close = await openPortalDatabase();
  app = createPortalTestApp();
  await settingsRepo.updateAll({ adminButton: custom });
  settingsCacheService.invalidate();
});

afterEach(() => {
  licenseService.hasFeature = originalHasFeature;
  close();
});

async function buttonColors(): Promise<AdminButtonColors> {
  const response = await app.request(`${portalOrigin}/api/portal/config`);
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    config: { branding: { buttonColors: AdminButtonColors } };
  };
  return body.config.branding.buttonColors;
}

it('uses the Admin Console button colors with custom branding', async () => {
  licenseService.hasFeature = () => true;
  expect(await buttonColors()).toEqual(custom);
});

it('uses the default button colors without custom branding', async () => {
  licenseService.hasFeature = () => false;
  expect(await buttonColors()).toEqual(DEFAULT_ADMIN_BUTTON);
});
