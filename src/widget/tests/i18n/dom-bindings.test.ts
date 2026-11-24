import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { installDom } from '../helpers/dom';
import {
  __resetI18nForTests,
  configureManualLock,
  getLocale,
  installLanguageObservers,
  publicSetLanguage,
} from '../../i18n/index';

interface InfoCapture {
  calls: string[];
  restore: () => void;
}

function captureConsoleInfo(): InfoCapture {
  const calls: string[] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => {
    calls.push(args.map((arg) => String(arg)).join(' '));
  };
  return {
    calls,
    restore: () => {
      console.info = original;
    },
  };
}

describe('installLanguageObservers', () => {
  let teardownDom: () => void;
  let teardownObservers: () => void = () => {};

  beforeEach(() => {
    teardownDom = installDom();
    __resetI18nForTests();
  });

  afterEach(() => {
    teardownObservers();
    teardownObservers = () => {};
    teardownDom();
    __resetI18nForTests();
  });

  describe('manual mode', () => {
    it('installs nothing and returns a no-op teardown', () => {
      const before = {
        addDoc: document.addEventListener,
        addWin: window.addEventListener,
      };
      teardownObservers = installLanguageObservers({
        mode: 'manual',
        scriptLanguage: null,
        projectDefault: 'de',
      });
      expect(document.addEventListener).toBe(before.addDoc);
      expect(window.addEventListener).toBe(before.addWin);
      expect(typeof teardownObservers).toBe('function');
    });

    it('does not switch the active locale on bugpin:set-language in manual mode', () => {
      teardownObservers = installLanguageObservers({
        mode: 'manual',
        scriptLanguage: null,
        projectDefault: 'de',
      });
      expect(getLocale()).toBe('en');
      document.dispatchEvent(
        new CustomEvent('bugpin:set-language', { detail: { language: 'fr' } })
      );
      expect(getLocale()).toBe('en');
    });

    it('logs once per BugPin.setLanguage attempt under manual lock', () => {
      configureManualLock({ mode: 'manual' });
      const info = captureConsoleInfo();
      try {
        const first = publicSetLanguage('fr');
        const second = publicSetLanguage('de');
        expect(first).toBeNull();
        expect(second).toBeNull();
        expect(info.calls).toEqual([
          '[BugPin] Language is locked by project configuration',
          '[BugPin] Language is locked by project configuration',
        ]);
      } finally {
        info.restore();
      }
    });
  });

  describe('auto mode', () => {
    it('switches the active locale and dispatches bugpin:language-changed on bugpin:set-language', () => {
      teardownObservers = installLanguageObservers({
        mode: 'auto',
        scriptLanguage: null,
        projectDefault: 'en',
      });

      const seen: string[] = [];
      document.addEventListener('bugpin:language-changed', (event: Event) => {
        const detail = (event as CustomEvent<{ language?: string }>).detail;
        if (detail && typeof detail.language === 'string') seen.push(detail.language);
      });

      document.dispatchEvent(
        new CustomEvent('bugpin:set-language', { detail: { language: 'fr-FR' } })
      );

      expect(getLocale()).toBe('fr');
      expect(seen).toEqual(['fr']);
    });

    it('falls through to projectDefault when the event payload is unsupported', () => {
      teardownObservers = installLanguageObservers({
        mode: 'auto',
        scriptLanguage: null,
        projectDefault: 'nl',
      });

      document.dispatchEvent(
        new CustomEvent('bugpin:set-language', { detail: { language: 'ko-KR' } })
      );

      expect(getLocale()).toBe('nl');
    });

    it('reacts to <html lang> mutations via MutationObserver', async () => {
      teardownObservers = installLanguageObservers({
        mode: 'auto',
        scriptLanguage: null,
        projectDefault: 'en',
      });

      document.documentElement.setAttribute('lang', 'de-DE');

      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      expect(getLocale()).toBe('de');
    });
  });
});

describe('publicSetLanguage', () => {
  let teardownDom: () => void;

  beforeEach(() => {
    teardownDom = installDom();
    __resetI18nForTests();
  });

  afterEach(() => {
    teardownDom();
    __resetI18nForTests();
  });

  it('returns the resolved locale and switches when input is supported', () => {
    configureManualLock({ mode: 'auto' });
    expect(publicSetLanguage('fr-FR')).toBe('fr');
    expect(getLocale()).toBe('fr');
  });

  it('returns null and dispatches nothing when input is unsupported', () => {
    configureManualLock({ mode: 'auto' });
    let dispatched = false;
    document.addEventListener('bugpin:language-changed', () => {
      dispatched = true;
    });
    expect(publicSetLanguage('ko-KR')).toBeNull();
    expect(getLocale()).toBe('en');
    expect(dispatched).toBe(false);
  });
});
