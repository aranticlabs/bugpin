import { describe, expect, it } from 'vitest';
import {
  SETTINGS_HOME_PATH,
  SETTINGS_NAVIGATION,
  canOpenSettingsPage,
  findSettingsNavItem,
  isSettingsPath,
  settingsNavigationFor,
} from '../../lib/settingsNavigation';

describe('settings navigation', () => {
  it('shows every group to admins', () => {
    const groups = settingsNavigationFor({ role: 'admin' }).map((group) => group.label);
    expect(groups).toEqual(SETTINGS_NAVIGATION.map((group) => group.label));
  });

  it.each(['editor', 'viewer'] as const)('limits %s to personal account pages', (role) => {
    const groups = settingsNavigationFor({ role, apiAccessEnabled: false });
    expect(groups.map((group) => group.label)).toEqual(['Account']);
    expect(groups[0].items.map((item) => item.title)).toEqual(['Profile', 'Notifications']);
  });

  it.each(['editor', 'viewer'] as const)(
    'shows API tokens to %s users once an admin allowed API access',
    (role) => {
      const items = settingsNavigationFor({ role, apiAccessEnabled: true })[0].items;
      expect(items.map((item) => item.title)).toContain('API Tokens');
    }
  );

  it('starts at a page every role can open', () => {
    const match = findSettingsNavItem(SETTINGS_HOME_PATH);
    expect(match?.group.adminOnly).toBeFalsy();
    expect(match?.item.adminOnly).toBeFalsy();
  });

  it('places Reporters under Access for admins only', () => {
    expect(findSettingsNavItem('/settings/reporters')).toMatchObject({
      group: { label: 'Access', adminOnly: true },
      item: { title: 'Reporters' },
    });
    expect(canOpenSettingsPage({ role: 'admin' }, '/settings/reporters')).toBe(true);
    for (const role of ['editor', 'viewer'] as const)
      expect(canOpenSettingsPage({ role }, '/settings/reporters')).toBe(false);
  });

  it('finds the group and page for a path', () => {
    expect(findSettingsNavItem('/settings/authentication')).toMatchObject({
      group: { label: 'Access' },
      item: { title: 'Authentication' },
    });
    expect(findSettingsNavItem('/settings')).toBeNull();
    expect(findSettingsNavItem('/reports')).toBeNull();
  });

  it('uses unique paths', () => {
    const paths = SETTINGS_NAVIGATION.flatMap((group) => group.items.map((item) => item.path));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('lets non-admins open only the pages of their navigation', () => {
    const viewer = { role: 'viewer', apiAccessEnabled: true } as const;
    expect(canOpenSettingsPage(viewer, '/settings/account/api-tokens')).toBe(true);
    expect(
      canOpenSettingsPage({ ...viewer, apiAccessEnabled: false }, '/settings/account/api-tokens')
    ).toBe(false);
    expect(canOpenSettingsPage(viewer, '/settings/email')).toBe(false);
    expect(canOpenSettingsPage({ role: 'admin' }, '/settings/email')).toBe(true);
  });

  it('recognizes paths inside settings', () => {
    expect(isSettingsPath('/settings')).toBe(true);
    expect(isSettingsPath('/settings/users/user-3')).toBe(true);
    expect(isSettingsPath('/settingsfoo')).toBe(false);
    expect(isSettingsPath('/')).toBe(false);
  });
});
