import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { normalizeLocale, type Catalog, type Locale } from './catalog';
import en from './locales/en';
import de from './locales/de';
import es from './locales/es';
import fr from './locales/fr';
import it from './locales/it';
import ja from './locales/ja';
import nl from './locales/nl';
import zh from './locales/zh';

const catalogs: Record<Locale, Catalog> = { en, de, es, fr, it, ja, nl, zh };
const I18nContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: keyof Catalog, values?: Record<string, string | number>) => string;
} | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { reporter } = useAuth();
  const [pageLocale, setLocale] = useState<Locale>(
    () => navigator.languages.map(normalizeLocale).find((value) => value !== null) ?? 'en'
  );
  const locale = (reporter && normalizeLocale(reporter.locale)) || pageLocale;
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  function t(key: keyof Catalog, values: Record<string, string | number> = {}) {
    return catalogs[locale][key].replace(/\{(\w+)\}/g, (match, name: string) =>
      String(values[name] ?? match)
    );
  }
  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const i18n = useContext(I18nContext);
  if (!i18n) throw new Error('I18nProvider is required');
  return i18n;
}
