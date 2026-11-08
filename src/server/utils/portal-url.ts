import { isIP } from 'node:net';
import { config } from '../config.js';

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
