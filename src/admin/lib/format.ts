import type { ApiTokenScope } from '@shared/types';

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatShortDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', { dateStyle: 'medium' });
}

export function formatTokenScope(scopes: readonly ApiTokenScope[]): string {
  if (scopes.includes('admin')) return 'Admin';
  if (scopes.includes('write')) return 'Read and write';
  return 'Read';
}
