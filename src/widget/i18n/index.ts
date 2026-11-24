import type { LocaleCode } from '@shared/types';
import type { WidgetCatalog, WidgetCatalogKey } from './catalog.js';
import en from './locales/en.js';
import de from './locales/de.js';
import fr from './locales/fr.js';
import nl from './locales/nl.js';
import es from './locales/es.js';
import it from './locales/it.js';
import ja from './locales/ja.js';
import ptBR from './locales/pt-BR.js';
import zh from './locales/zh.js';
import { normalizeLocale } from './normalize.js';
import { resolveLiveSwitch } from './detect.js';

type EnCatalog = WidgetCatalog;
type LocaleCatalog = WidgetCatalog | Partial<WidgetCatalog>;

const catalogs: Record<LocaleCode, LocaleCatalog> = {
  en,
  de,
  fr,
  nl,
  es,
  it,
  ja,
  'pt-BR': ptBR,
  zh,
};

const enCatalog: EnCatalog = en;

type LocaleListener = (locale: LocaleCode) => void;

let activeLocale: LocaleCode = 'en';
const listeners = new Set<LocaleListener>();

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return String(vars[name]);
    }
    return match;
  });
}

export function t(key: WidgetCatalogKey, vars?: Record<string, string | number>): string {
  const active = catalogs[activeLocale];
  const raw = active[key] ?? enCatalog[key] ?? key;
  return interpolate(raw, vars);
}

export function getLocale(): LocaleCode {
  return activeLocale;
}

function dispatchLanguageChanged(code: LocaleCode): void {
  if (typeof document === 'undefined') return;
  const view = document.defaultView;
  const CustomEventCtor =
    view && typeof view.CustomEvent === 'function'
      ? view.CustomEvent
      : typeof CustomEvent !== 'undefined'
        ? CustomEvent
        : null;
  if (!CustomEventCtor) return;
  document.dispatchEvent(
    new CustomEventCtor('bugpin:language-changed', {
      detail: { language: code },
    })
  );
}

export function setLocale(code: LocaleCode): void {
  if (code === activeLocale) return;
  activeLocale = code;
  for (const listener of listeners) {
    listener(code);
  }
  dispatchLanguageChanged(code);
}

export function subscribe(listener: LocaleListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface InstallLanguageObserversOptions {
  mode: 'auto' | 'manual';
  scriptLanguage: string | null;
  projectDefault: LocaleCode;
}

export function installLanguageObservers(opts: InstallLanguageObserversOptions): () => void {
  if (opts.mode === 'manual') {
    return () => {};
  }
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return () => {};
  }

  const applySwitch = (source: string | null): void => {
    const resolved = resolveLiveSwitch(source, opts.scriptLanguage, opts.projectDefault);
    if (resolved) setLocale(resolved);
  };

  const handleSetLanguage = (event: Event): void => {
    const detail = (event as CustomEvent<{ language?: unknown }>).detail;
    const raw = detail && typeof detail.language === 'string' ? detail.language : null;
    applySwitch(raw);
  };

  const handleLanguageChange = (): void => {
    const lang =
      typeof navigator !== 'undefined' && typeof navigator.language === 'string'
        ? navigator.language
        : null;
    const resolved = resolveLiveSwitch(lang, opts.scriptLanguage, opts.projectDefault);
    if (resolved) setLocale(resolved);
  };

  const view = document.defaultView;
  const MutationObserverCtor =
    view && typeof view.MutationObserver === 'function'
      ? view.MutationObserver
      : typeof MutationObserver !== 'undefined'
        ? MutationObserver
        : null;
  const observer = MutationObserverCtor
    ? new MutationObserverCtor(() => {
        const root = document.documentElement;
        const lang = root ? root.getAttribute('lang') : null;
        applySwitch(lang);
      })
    : null;

  if (observer && document.documentElement) {
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang'],
    });
  }

  document.addEventListener('bugpin:set-language', handleSetLanguage);
  window.addEventListener('languagechange', handleLanguageChange);

  return () => {
    if (observer) observer.disconnect();
    document.removeEventListener('bugpin:set-language', handleSetLanguage);
    window.removeEventListener('languagechange', handleLanguageChange);
  };
}

export interface ManualLockGuardOptions {
  mode: 'auto' | 'manual';
}

let manualLockState: { mode: 'auto' | 'manual' } = { mode: 'auto' };

export function configureManualLock(opts: ManualLockGuardOptions): void {
  manualLockState = { mode: opts.mode };
}

function logManualLock(): void {
  console.info('[BugPin] Language is locked by project configuration');
}

export function __resetI18nForTests(): void {
  activeLocale = 'en';
  listeners.clear();
  manualLockState = { mode: 'auto' };
}

export function publicSetLanguage(raw: unknown): LocaleCode | null {
  if (manualLockState.mode === 'manual') {
    logManualLock();
    return null;
  }
  const normalized = normalizeLocale(raw);
  if (!normalized) return null;
  setLocale(normalized);
  return normalized;
}

export type { WidgetCatalog, WidgetCatalogKey } from './catalog.js';
