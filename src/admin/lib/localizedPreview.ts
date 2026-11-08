import { SUPPORTED_LOCALES, type LocaleCode, type LocalizedString } from '@shared/types';

export type BuiltinTexts = Partial<Record<LocaleCode, string>>;

// Mirrors the widget's lookup: project text, then the global default, then the built-in text.
export function resolveForPreview(
  project: LocalizedString | null | undefined,
  global: LocalizedString | null,
  builtin: BuiltinTexts | null,
  locale: LocaleCode = 'en'
): string | null {
  if (project === null) return null;
  if (project) {
    if (project[locale]) return project[locale] ?? null;
    if (project.en) return project.en;
  }
  if (global) {
    if (global[locale]) return global[locale] ?? null;
    if (global.en) return global.en;
  }
  if (builtin) {
    return builtin[locale] ?? builtin.en ?? null;
  }
  return null;
}

export function buildPerLocalePreview(
  global: LocalizedString | null,
  builtin: BuiltinTexts | null
): BuiltinTexts {
  const out: BuiltinTexts = {};
  for (const code of SUPPORTED_LOCALES) {
    const fromGlobal = global?.[code] ?? global?.en ?? '';
    const fromBuiltin = builtin?.[code] ?? builtin?.en ?? '';
    const value = fromGlobal || fromBuiltin;
    if (value) out[code] = value;
  }
  return out;
}
