const SETTINGS_TABS: Record<string, string> = {
  general: '/settings/general',
  smtp: '/settings/email',
  storage: '/settings/storage',
  'api-tokens': '/settings/account/api-tokens',
  webhooks: '/projects',
};

const LEGACY_PAGES: Record<string, (tab: string) => string> = {
  '/settings': (tab) => SETTINGS_TABS[tab] ?? '/settings/general',
  '/notifications': (tab) =>
    tab === 'email-templates' ? '/settings/email' : '/settings/project-defaults/notifications',
  '/users': () => '/settings/users',
  '/security': () => '/settings/authentication',
  '/security-privacy': (tab) =>
    tab === 'privacy' ? '/settings/data-privacy' : '/settings/authentication',
  '/branding': () => '/settings/branding',
  '/license': () => '/settings/license',
  '/button': () => '/settings/project-defaults/launcher-button',
  '/dialog': () => '/settings/project-defaults/dialog',
  '/language': () => '/settings/project-defaults/language',
  '/screenshot': () => '/settings/project-defaults/capture',
  '/recording': () => '/settings/project-defaults/capture',
};

export const LEGACY_PATHS = Object.keys(LEGACY_PAGES).filter((path) => path !== '/settings');

/** Resolves a path listed above and its hash tab to the page it opens, or null for other paths. */
export function legacySettingsPath(pathname: string, hash: string): string | null {
  const resolve = LEGACY_PAGES[pathname.replace(/\/$/, '')];
  return resolve ? resolve(hash.replace(/^#/, '')) : null;
}
