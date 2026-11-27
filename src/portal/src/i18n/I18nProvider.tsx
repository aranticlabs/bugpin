import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { normalizeLocale, type Catalog, type Locale, type MessageKey } from './catalog';
import { team } from './team';
import en from './locales/en';
import de from './locales/de';
import es from './locales/es';
import fr from './locales/fr';
import it from './locales/it';
import ja from './locales/ja';
import nl from './locales/nl';
import zh from './locales/zh';

const catalogs: Record<Locale, Catalog> = { en, de, es, fr, it, ja, nl, zh };

// The Admin Console is English-only, so staff see the team view and team sign-in in English too.
const TEAM_LOCALE: Locale = 'en';

const I18nContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  setTeamPage: (active: boolean) => void;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
} | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { reporter, operator } = useAuth();
  const [teamPage, setTeamPage] = useState(false);
  const [pageLocale, setLocale] = useState<Locale>(
    () => navigator.languages.map(normalizeLocale).find((value) => value !== null) ?? 'en'
  );
  const locale =
    operator || teamPage
      ? TEAM_LOCALE
      : (reporter && normalizeLocale(reporter.locale)) || pageLocale;
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  function t(key: MessageKey, values: Record<string, string | number> = {}) {
    const text =
      key in team ? team[key as keyof typeof team] : catalogs[locale][key as keyof Catalog];
    return text.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
  }
  return (
    <I18nContext.Provider value={{ locale, setLocale, setTeamPage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

/** Renders the current page in the team language while it is mounted */
export function useTeamPage() {
  const { setTeamPage } = useI18n();
  useEffect(() => {
    setTeamPage(true);
    return () => setTeamPage(false);
  }, [setTeamPage]);
}

export function useI18n() {
  const i18n = useContext(I18nContext);
  if (!i18n) throw new Error('I18nProvider is required');
  return i18n;
}
