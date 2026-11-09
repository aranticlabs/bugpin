import type { LucideIcon } from 'lucide-react';
import {
  AppWindow,
  Bell,
  Camera,
  Globe,
  HardDrive,
  Key,
  KeyRound,
  Languages,
  Mail,
  MousePointerClick,
  Paintbrush,
  Palette,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Trophy,
  User,
  UsersRound,
} from 'lucide-react';
import type { User as AppUser } from '@shared/types';

export interface SettingsNavItem {
  title: string;
  path: string;
  icon: LucideIcon;
  description: string;
  adminOnly?: boolean;
  requiresApiAccess?: boolean;
  enterprise?: boolean;
}

export interface SettingsNavGroup {
  label: string;
  adminOnly?: boolean;
  items: SettingsNavItem[];
}

export const SETTINGS_HOME_PATH = '/settings/account/profile';

export const SETTINGS_NAVIGATION: SettingsNavGroup[] = [
  {
    label: 'Account',
    items: [
      {
        title: 'Profile',
        description: 'Manage your account details and security',
        path: '/settings/account/profile',
        icon: User,
      },
      {
        title: 'Notifications',
        description: 'Choose which notifications you receive',
        path: '/settings/account/notifications',
        icon: Bell,
      },
      {
        title: 'API Tokens',
        description: 'Create and manage tokens for API access',
        path: '/settings/account/api-tokens',
        icon: Key,
        requiresApiAccess: true,
        enterprise: true,
      },
    ],
  },
  {
    label: 'System',
    adminOnly: true,
    items: [
      {
        title: 'General',
        description: 'Application name, URL and update checks',
        path: '/settings/general',
        icon: SlidersHorizontal,
      },
      {
        title: 'Privacy & Data',
        description: 'Manage data retention, deletion and privacy controls',
        path: '/settings/data-privacy',
        icon: Shield,
      },
      {
        title: 'Email',
        description: 'Configure outgoing email and notification templates',
        path: '/settings/email',
        icon: Mail,
      },
      {
        title: 'Gamification',
        description: 'Levels and achievements on the dashboard',
        path: '/settings/gamification',
        icon: Trophy,
      },
      {
        title: 'Storage',
        description: 'Choose where screenshots and attachments are stored',
        path: '/settings/storage',
        icon: HardDrive,
        enterprise: true,
      },
      {
        title: 'License',
        description: 'Manage your Enterprise license',
        path: '/settings/license',
        icon: KeyRound,
        enterprise: true,
      },
    ],
  },
  {
    label: 'Project Defaults',
    adminOnly: true,
    items: [
      {
        title: 'Launcher Button',
        description: 'Default appearance of the widget launcher button',
        path: '/settings/project-defaults/launcher-button',
        icon: MousePointerClick,
      },
      {
        title: 'Dialog',
        description: 'Default texts, fields and colors of the report dialog',
        path: '/settings/project-defaults/dialog',
        icon: AppWindow,
      },
      {
        title: 'Language',
        description: 'Default language of the widget',
        path: '/settings/project-defaults/language',
        icon: Languages,
      },
      {
        title: 'Capture',
        description: 'Default screenshot and recording settings',
        path: '/settings/project-defaults/capture',
        icon: Camera,
      },
      {
        title: 'Notifications',
        description: 'Default email notifications for the team and for reporters',
        path: '/settings/project-defaults/notifications',
        icon: Bell,
      },
    ],
  },
  {
    label: 'Access',
    adminOnly: true,
    items: [
      {
        title: 'Users',
        description: 'Manage user accounts and permissions',
        path: '/settings/users',
        icon: UsersRound,
      },
      {
        title: 'Reporters',
        description: 'Manage reporter accounts and portal access',
        path: '/settings/reporters',
        icon: UsersRound,
      },
      {
        title: 'Authentication',
        description: 'Sessions, two-factor enforcement and password policy',
        path: '/settings/authentication',
        icon: ShieldCheck,
      },
      {
        title: 'Network',
        description: 'HTTPS enforcement and widget rate limiting',
        path: '/settings/network',
        icon: Globe,
      },
    ],
  },
  {
    label: 'Customization',
    adminOnly: true,
    items: [
      {
        title: 'Branding',
        description: 'Customize logos and brand colors',
        path: '/settings/branding',
        icon: Palette,
        enterprise: true,
      },
      {
        title: 'White-label',
        description: 'Control footer branding in the Admin Console and email notifications',
        path: '/settings/white-label',
        icon: Paintbrush,
        enterprise: true,
      },
    ],
  },
];

type NavigationUser = Pick<AppUser, 'role' | 'apiAccessEnabled'> | null | undefined;

export function canUseApiTokens(user: NavigationUser): boolean {
  return user?.role === 'admin' || user?.apiAccessEnabled === true;
}

export function settingsNavigationFor(user: NavigationUser): SettingsNavGroup[] {
  const isAdmin = user?.role === 'admin';
  const isVisible = (item: SettingsNavItem) =>
    (isAdmin || !item.adminOnly) && (!item.requiresApiAccess || canUseApiTokens(user));
  return SETTINGS_NAVIGATION.filter((group) => isAdmin || !group.adminOnly)
    .map((group) => ({ ...group, items: group.items.filter(isVisible) }))
    .filter((group) => group.items.length > 0);
}

export function isSettingsPath(pathname: string): boolean {
  return pathname === '/settings' || pathname.startsWith('/settings/');
}

/** Whether the settings navigation of this user contains the page at `path` */
export function canOpenSettingsPage(user: NavigationUser, path: string): boolean {
  return settingsNavigationFor(user).some((group) =>
    group.items.some((item) => item.path === path)
  );
}

export function findSettingsNavItem(
  pathname: string
): { group: SettingsNavGroup; item: SettingsNavItem } | null {
  for (const group of SETTINGS_NAVIGATION) {
    const item = group.items.find(
      (candidate) => pathname === candidate.path || pathname.startsWith(`${candidate.path}/`)
    );
    if (item) return { group, item };
  }
  return null;
}
