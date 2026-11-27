import { describe, it, expect } from 'bun:test';
import { normalizeLocale } from '../../i18n/normalize';

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
      expect(normalizeLocale('pt-BR')).toBe('pt-BR');
    });
  });

  describe('Portuguese variants', () => {
    it('folds pt, pt-BR and pt-PT to pt-BR', () => {
      expect(normalizeLocale('pt')).toBe('pt-BR');
      expect(normalizeLocale('pt-BR')).toBe('pt-BR');
      expect(normalizeLocale('pt-PT')).toBe('pt-BR');
    });

    it('folds casing and underscore variants of pt to pt-BR', () => {
      expect(normalizeLocale('PT-br')).toBe('pt-BR');
      expect(normalizeLocale('pt_BR')).toBe('pt-BR');
      expect(normalizeLocale('pt-AO')).toBe('pt-BR');
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
