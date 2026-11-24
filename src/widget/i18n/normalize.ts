import type { LocaleCode } from '@shared/types';

export function normalizeLocale(input: unknown): LocaleCode | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const lower = trimmed.toLowerCase().replace(/_/g, '-');
  const subtags = lower.split('-');
  const primary = subtags[0];
  if (!primary) return null;

  if (primary === 'pt') return 'pt-BR';

  if (primary === 'zh') {
    const script = subtags.find((tag) => tag.length === 4);
    if (script === 'hant') return null;
    if (script === 'hans') return 'zh';

    const region = subtags[1];
    if (region === 'tw' || region === 'hk' || region === 'mo') return null;

    return 'zh';
  }

  if (
    primary === 'en' ||
    primary === 'de' ||
    primary === 'fr' ||
    primary === 'nl' ||
    primary === 'es' ||
    primary === 'it' ||
    primary === 'ja'
  ) {
    return primary;
  }

  return null;
}
