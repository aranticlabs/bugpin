import { afterEach, beforeEach, expect, it } from 'bun:test';
import { openPortalDatabase } from './helpers';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { settingsService } from '../../../src/server/services/settings.service';

let close: () => void;

beforeEach(async () => {
  close = await openPortalDatabase();
  await settingsRepo.updateAll({ appUrl: '' });
  settingsCacheService.invalidate();
});
afterEach(() => close());

it('fills an empty Application URL from APP_URL', async () => {
  expect(await settingsService.seedAppUrl('http://localhost:7300')).toBe(true);
  expect((await settingsRepo.getAll()).appUrl).toBe('http://localhost:7300');
  expect((await settingsCacheService.getAll()).appUrl).toBe('http://localhost:7300');
});

it('keeps an Application URL saved in the Admin Console', async () => {
  await settingsRepo.updateAll({ appUrl: 'https://bugpin.example.com' });
  expect(await settingsService.seedAppUrl('http://localhost:7300')).toBe(false);
  expect((await settingsRepo.getAll()).appUrl).toBe('https://bugpin.example.com');
});

it('does nothing without APP_URL', async () => {
  expect(await settingsService.seedAppUrl(undefined)).toBe(false);
  expect((await settingsRepo.getAll()).appUrl).toBe('');
});
