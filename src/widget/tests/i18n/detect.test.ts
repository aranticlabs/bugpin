import { describe, it, expect } from 'bun:test';
import { detectLocale, resolveLiveSwitch } from '../../i18n/detect';

describe('detectLocale', () => {
  describe('manual mode', () => {
    it('returns projectDefault unconditionally', () => {
      expect(
        detectLocale({
          mode: 'manual',
          projectDefault: 'de',
          initLanguage: 'fr',
          scriptLanguage: 'es',
          documentLang: 'ja',
          navigatorLanguages: ['nl-NL'],
        })
      ).toBe('de');
    });

    it('ignores supported sources entirely in manual mode', () => {
      expect(
        detectLocale({
          mode: 'manual',
          projectDefault: 'en',
          initLanguage: 'fr',
        })
      ).toBe('en');
    });
  });

  describe('auto mode waterfall', () => {
    it('1. init language wins over everything', () => {
      expect(
        detectLocale({
          mode: 'auto',
          projectDefault: 'de',
          initLanguage: 'fr',
          scriptLanguage: 'es',
          documentLang: 'it',
          navigatorLanguages: ['ja'],
        })
      ).toBe('fr');
    });

    it('2. script-tag language wins when init is missing or unsupported', () => {
      expect(
        detectLocale({
          mode: 'auto',
          projectDefault: 'de',
          scriptLanguage: 'fr',
          documentLang: 'it',
          navigatorLanguages: ['ja'],
        })
      ).toBe('fr');
    });

    it('skips unsupported init and falls through to script', () => {
      expect(
        detectLocale({
          mode: 'auto',
          projectDefault: 'de',
          initLanguage: 'ko-KR',
          scriptLanguage: 'fr',
        })
      ).toBe('fr');
    });

    it('3. document.documentElement.lang wins when init and script are missing', () => {
      expect(
        detectLocale({
          mode: 'auto',
          projectDefault: 'de',
          documentLang: 'fr-FR',
          navigatorLanguages: ['ja'],
        })
      ).toBe('fr');
    });

    it('4. navigator.languages first supported entry wins', () => {
      expect(
        detectLocale({
          mode: 'auto',
          projectDefault: 'de',
          navigatorLanguages: ['fr-FR'],
        })
      ).toBe('fr');
    });

    it('navigator scan picks the first supported entry past unsupported ones', () => {
      expect(
        detectLocale({
          mode: 'auto',
          projectDefault: 'de',
          navigatorLanguages: ['ko-KR', 'ru-RU', 'ja-JP'],
        })
      ).toBe('ja');
    });

    it('5. project default wins when nothing else resolves', () => {
      expect(
        detectLocale({
          mode: 'auto',
          projectDefault: 'nl',
          navigatorLanguages: ['ko-KR'],
        })
      ).toBe('nl');
    });

    it('6. final fallback is en when even projectDefault is unsupported (defensive)', () => {
      expect(
        detectLocale({
          mode: 'auto',
          projectDefault: 'xx' as 'en',
          navigatorLanguages: ['ko-KR'],
        })
      ).toBe('en');
    });

    it('Traditional Chinese in any layer falls through (does not match zh)', () => {
      expect(
        detectLocale({
          mode: 'auto',
          projectDefault: 'de',
          documentLang: 'zh-TW',
          navigatorLanguages: ['zh-Hant-TW'],
        })
      ).toBe('de');
    });

    it('Simplified Chinese matches via zh-Hans', () => {
      expect(
        detectLocale({
          mode: 'auto',
          projectDefault: 'en',
          documentLang: 'zh-Hans-CN',
        })
      ).toBe('zh');
    });
  });
});

describe('resolveLiveSwitch', () => {
  it('returns the source when normalizable', () => {
    expect(resolveLiveSwitch('fr-FR', 'de', 'en')).toBe('fr');
  });

  it('falls through to scriptLanguage when source is null/unsupported', () => {
    expect(resolveLiveSwitch(null, 'de', 'en')).toBe('de');
    expect(resolveLiveSwitch('ko-KR', 'de', 'en')).toBe('de');
  });

  it('falls through to projectDefault when source and script are unsupported', () => {
    expect(resolveLiveSwitch(null, null, 'nl')).toBe('nl');
    expect(resolveLiveSwitch('xx', 'yy', 'nl')).toBe('nl');
  });

  it('returns null when nothing resolves', () => {
    expect(resolveLiveSwitch(null, null, 'xx' as 'en')).toBeNull();
  });
});
