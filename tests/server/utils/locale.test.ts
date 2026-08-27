import { describe, it, expect } from 'bun:test';
import { normalizeLocale, resolveSubmitLocale } from '../../../src/server/utils/locale';

describe('normalizeLocale', () => {
  describe('supported primary tags', () => {
    it('normalizes each supported primary tag to itself', () => {
      expect(normalizeLocale('en')).toBe('en');
      expect(normalizeLocale('de')).toBe('de');
      expect(normalizeLocale('fr')).toBe('fr');
      expect(normalizeLocale('nl')).toBe('nl');
      expect(normalizeLocale('es')).toBe('es');
      expect(normalizeLocale('it')).toBe('it');
      expect(normalizeLocale('ja')).toBe('ja');
      expect(normalizeLocale('zh')).toBe('zh');
    });
  });

  describe('region variants strip to primary subtag', () => {
    it('folds en-US, en-GB to en', () => {
      expect(normalizeLocale('en-US')).toBe('en');
      expect(normalizeLocale('en-GB')).toBe('en');
    });

    it('folds de-DE, de-AT, de-CH to de', () => {
      expect(normalizeLocale('de-DE')).toBe('de');
      expect(normalizeLocale('de-AT')).toBe('de');
      expect(normalizeLocale('de-CH')).toBe('de');
    });

    it('folds fr-FR, fr-CA, fr-BE to fr', () => {
      expect(normalizeLocale('fr-FR')).toBe('fr');
      expect(normalizeLocale('fr-CA')).toBe('fr');
      expect(normalizeLocale('fr-BE')).toBe('fr');
    });

    it('folds nl-NL, nl-BE to nl', () => {
      expect(normalizeLocale('nl-NL')).toBe('nl');
      expect(normalizeLocale('nl-BE')).toBe('nl');
    });

    it('folds es-ES, es-MX, es-AR to es', () => {
      expect(normalizeLocale('es-ES')).toBe('es');
      expect(normalizeLocale('es-MX')).toBe('es');
      expect(normalizeLocale('es-AR')).toBe('es');
    });

    it('folds it-IT, it-CH to it', () => {
      expect(normalizeLocale('it-IT')).toBe('it');
      expect(normalizeLocale('it-CH')).toBe('it');
    });

    it('folds ja-JP to ja', () => {
      expect(normalizeLocale('ja-JP')).toBe('ja');
    });
  });

  describe('Simplified Chinese variants', () => {
    it('folds zh-CN to zh', () => {
      expect(normalizeLocale('zh-CN')).toBe('zh');
    });

    it('folds zh-Hans and zh-Hans-* to zh', () => {
      expect(normalizeLocale('zh-Hans')).toBe('zh');
      expect(normalizeLocale('zh-Hans-CN')).toBe('zh');
      expect(normalizeLocale('zh-Hans-SG')).toBe('zh');
    });

    it('folds bare zh-SG to zh', () => {
      expect(normalizeLocale('zh-SG')).toBe('zh');
    });
  });

  describe('Traditional Chinese variants resolve to null', () => {
    it('rejects zh-TW, zh-HK, zh-MO', () => {
      expect(normalizeLocale('zh-TW')).toBeNull();
      expect(normalizeLocale('zh-HK')).toBeNull();
      expect(normalizeLocale('zh-MO')).toBeNull();
    });

    it('rejects zh-Hant and zh-Hant-* tails', () => {
      expect(normalizeLocale('zh-Hant')).toBeNull();
      expect(normalizeLocale('zh-Hant-TW')).toBeNull();
      expect(normalizeLocale('zh-Hant-HK')).toBeNull();
    });
  });

  describe('unsupported primary tags resolve to null', () => {
    it('returns null for pt-BR', () => {
      expect(normalizeLocale('pt-BR')).toBeNull();
    });

    it('returns null for ru, ar, ko, pl, cs', () => {
      expect(normalizeLocale('ru')).toBeNull();
      expect(normalizeLocale('ar')).toBeNull();
      expect(normalizeLocale('ko')).toBeNull();
      expect(normalizeLocale('pl')).toBeNull();
      expect(normalizeLocale('cs')).toBeNull();
    });
  });

  describe('casing and separators', () => {
    it('handles uppercase EN', () => {
      expect(normalizeLocale('EN')).toBe('en');
    });

    it('handles mixed case Fr-fr', () => {
      expect(normalizeLocale('Fr-fr')).toBe('fr');
    });

    it('handles all caps ZH-HANS', () => {
      expect(normalizeLocale('ZH-HANS')).toBe('zh');
    });

    it('handles all caps ZH-HANT as null', () => {
      expect(normalizeLocale('ZH-HANT')).toBeNull();
    });

    it('handles underscore separator nl_BE', () => {
      expect(normalizeLocale('nl_BE')).toBe('nl');
    });

    it('handles underscore separator zh_Hans_CN', () => {
      expect(normalizeLocale('zh_Hans_CN')).toBe('zh');
    });

    it('handles underscore separator zh_Hant_TW', () => {
      expect(normalizeLocale('zh_Hant_TW')).toBeNull();
    });
  });

  describe('garbage and non-string inputs', () => {
    it('returns null for empty string', () => {
      expect(normalizeLocale('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(normalizeLocale('   ')).toBeNull();
    });

    it('returns null for numbers', () => {
      expect(normalizeLocale(42)).toBeNull();
      expect(normalizeLocale(0)).toBeNull();
    });

    it('returns null for null and undefined', () => {
      expect(normalizeLocale(null)).toBeNull();
      expect(normalizeLocale(undefined)).toBeNull();
    });

    it('returns null for booleans', () => {
      expect(normalizeLocale(true)).toBeNull();
      expect(normalizeLocale(false)).toBeNull();
    });

    it('returns null for objects and arrays', () => {
      expect(normalizeLocale({})).toBeNull();
      expect(normalizeLocale(['en'])).toBeNull();
    });

    it('returns null for arbitrary garbage strings', () => {
      expect(normalizeLocale('not-a-locale')).toBeNull();
      expect(normalizeLocale('xyz')).toBeNull();
      expect(normalizeLocale('123')).toBeNull();
    });
  });
});

describe('resolveSubmitLocale', () => {
  describe('manual mode overwrite', () => {
    it('returns the project default regardless of claimed locale', () => {
      expect(
        resolveSubmitLocale({
          claimed: 'fr',
          projectMode: 'manual',
          projectDefault: 'de',
        })
      ).toBe('de');
    });

    it('ignores garbage claimed values in manual mode', () => {
      expect(
        resolveSubmitLocale({
          claimed: 'not-a-locale',
          projectMode: 'manual',
          projectDefault: 'ja',
        })
      ).toBe('ja');
    });

    it('normalizes raw region tags in the project default', () => {
      expect(
        resolveSubmitLocale({
          claimed: 'fr',
          projectMode: 'manual',
          projectDefault: 'de-DE',
        })
      ).toBe('de');
    });

    it('falls back to en when the project default is invalid in manual mode', () => {
      expect(
        resolveSubmitLocale({
          claimed: 'fr',
          projectMode: 'manual',
          projectDefault: 'xx',
        })
      ).toBe('en');
    });

    it('falls back to en when the project default is missing in manual mode', () => {
      expect(
        resolveSubmitLocale({
          claimed: 'fr',
          projectMode: 'manual',
          projectDefault: undefined,
        })
      ).toBe('en');
    });
  });

  describe('auto mode', () => {
    it('returns the normalized claimed locale when it resolves', () => {
      expect(
        resolveSubmitLocale({
          claimed: 'fr-FR',
          projectMode: 'auto',
          projectDefault: 'en',
        })
      ).toBe('fr');
    });

    it('returns the normalized claimed locale even when project default differs', () => {
      expect(
        resolveSubmitLocale({
          claimed: 'ja',
          projectMode: 'auto',
          projectDefault: 'de',
        })
      ).toBe('ja');
    });

    it('falls back to the project default for garbage claimed values', () => {
      expect(
        resolveSubmitLocale({
          claimed: 'not-a-locale',
          projectMode: 'auto',
          projectDefault: 'de',
        })
      ).toBe('de');
    });

    it('falls back to the project default for unsupported claimed locales', () => {
      expect(
        resolveSubmitLocale({
          claimed: 'pt-BR',
          projectMode: 'auto',
          projectDefault: 'es',
        })
      ).toBe('es');
    });

    it('falls back to the project default for non-string claimed values', () => {
      expect(
        resolveSubmitLocale({
          claimed: 42,
          projectMode: 'auto',
          projectDefault: 'nl',
        })
      ).toBe('nl');
      expect(
        resolveSubmitLocale({
          claimed: undefined,
          projectMode: 'auto',
          projectDefault: 'nl',
        })
      ).toBe('nl');
      expect(
        resolveSubmitLocale({
          claimed: null,
          projectMode: 'auto',
          projectDefault: 'nl',
        })
      ).toBe('nl');
    });

    it('falls back to en when both claimed and project default are invalid', () => {
      expect(
        resolveSubmitLocale({
          claimed: 'pt-BR',
          projectMode: 'auto',
          projectDefault: 'xx',
        })
      ).toBe('en');
    });

    it('falls back to en when project default is missing and claimed is invalid', () => {
      expect(
        resolveSubmitLocale({
          claimed: 'garbage',
          projectMode: 'auto',
          projectDefault: undefined,
        })
      ).toBe('en');
    });
  });

  describe('missing mode coalesces to auto', () => {
    it('treats undefined mode as auto and uses the normalized claimed locale', () => {
      expect(
        resolveSubmitLocale({
          claimed: 'it',
          projectMode: undefined,
          projectDefault: 'en',
        })
      ).toBe('it');
    });

    it('treats undefined mode as auto and falls back to project default for garbage', () => {
      expect(
        resolveSubmitLocale({
          claimed: 'garbage',
          projectMode: undefined,
          projectDefault: 'de',
        })
      ).toBe('de');
    });

    it('treats undefined mode plus undefined default as auto/en', () => {
      expect(
        resolveSubmitLocale({
          claimed: 'garbage',
          projectMode: undefined,
          projectDefault: undefined,
        })
      ).toBe('en');
    });
  });
});
