import { describe, expect, it } from 'vitest';
import { LEGACY_PATHS, legacySettingsPath } from '../../lib/legacyRoutes';

describe('legacySettingsPath', () => {
  it.each([
    ['/settings', '', '/settings/general'],
    ['/settings', '#general', '/settings/general'],
    ['/settings', '#smtp', '/settings/email'],
    ['/settings', '#storage', '/settings/storage'],
    ['/settings', '#privacy', '/settings/data-privacy'],
    ['/settings', '#api-tokens', '/settings/account/api-tokens'],
    ['/settings', '#webhooks', '/projects'],
    ['/notifications', '', '/settings/project-defaults/notifications'],
    ['/notifications', '#reporter', '/settings/project-defaults/notifications'],
    ['/notifications', '#email-templates', '/settings/email'],
    ['/users', '', '/settings/users'],
    ['/security', '#two-factor', '/settings/authentication'],
    ['/security-privacy', '#privacy', '/settings/data-privacy'],
    ['/security-privacy', '', '/settings/authentication'],
    ['/branding', '', '/settings/branding'],
    ['/license', '', '/settings/license'],
    ['/button', '', '/settings/project-defaults/launcher-button'],
    ['/dialog', '', '/settings/project-defaults/dialog'],
    ['/language', '', '/settings/project-defaults/language'],
    ['/screenshot', '', '/settings/project-defaults/capture'],
    ['/recording', '/', '/settings/project-defaults/capture'],
  ])('maps %s%s to %s', (pathname, hash, expected) => {
    expect(legacySettingsPath(pathname, hash)).toBe(expected);
  });

  it('ignores a trailing slash', () => {
    expect(legacySettingsPath('/users/', '')).toBe('/settings/users');
  });

  it('returns null for current routes', () => {
    expect(legacySettingsPath('/reports', '')).toBeNull();
    expect(legacySettingsPath('/settings/general', '')).toBeNull();
  });

  it('lists every legacy page except the settings index for redirect routes', () => {
    expect(LEGACY_PATHS).not.toContain('/settings');
    expect(LEGACY_PATHS).toContain('/security');
    expect(LEGACY_PATHS).toContain('/recording');
  });
});
