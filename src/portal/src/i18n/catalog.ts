import en from './locales/en';
import type { TeamMessageKey } from './team';

export type Catalog = Record<keyof typeof en, string>;
export type MessageKey = keyof Catalog | TeamMessageKey;
export type Locale = 'en' | 'de' | 'es' | 'fr' | 'it' | 'ja' | 'nl' | 'zh';

export function normalizeLocale(value: string): Locale | null {
  const language = value.toLowerCase().split(/[-_]/)[0];
  return ['en', 'de', 'es', 'fr', 'it', 'ja', 'nl', 'zh'].includes(language)
    ? (language as Locale)
    : null;
}
