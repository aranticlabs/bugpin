import { isIP } from 'node:net';
import { config } from '../config.js';
import type { AppSettings, Project } from '@shared/types';

export function isSecurePortalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.protocol === 'https:') return true;
    if (url.protocol !== 'http:') return false;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    return (
      host === 'localhost' ||
      host === '::1' ||
      (isIP(host) === 4 && host.startsWith('127.')) ||
      (config.isDev && (host.endsWith('.local') || host.endsWith('.test')))
    );
  } catch {
    return false;
  }
}

export function projectPortalUrl(
  project: Pick<Project, 'settings'>,
  settings: Pick<AppSettings, 'appUrl' | 'portalBaseUrl'>
): string | null {
  const baseUrl = settings.portalBaseUrl || settings.appUrl;
  if (
    !project.settings.reporterPortal?.enabled ||
    !isSecurePortalUrl(settings.appUrl) ||
    !isSecurePortalUrl(baseUrl)
  )
    return null;
  return new URL('/reporter-portal/', baseUrl).href;
}
