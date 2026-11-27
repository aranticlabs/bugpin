import { expect, it } from 'vitest';
import { normalizeLocale } from '../src/i18n/catalog';
import en from '../src/i18n/locales/en';
import de from '../src/i18n/locales/de';
import es from '../src/i18n/locales/es';
import fr from '../src/i18n/locales/fr';
import itCatalog from '../src/i18n/locales/it';
import ja from '../src/i18n/locales/ja';
import nl from '../src/i18n/locales/nl';
import zh from '../src/i18n/locales/zh';

it.each([
  ['de-DE', 'de'],
  ['EN_us', 'en'],
  ['es', 'es'],
  ['fr-CA', 'fr'],
  ['it-IT', 'it'],
  ['ja-JP', 'ja'],
  ['nl-NL', 'nl'],
  ['zh-Hans', 'zh'],
  ['unknown', null],
  ['', null],
])('normalizes %s to a supported portal locale', (input, expected) => {
  expect(normalizeLocale(input)).toBe(expected);
});

it('keeps complete locale catalogs with matching interpolation placeholders', () => {
  for (const catalog of [en, de, es, fr, itCatalog, ja, nl, zh]) {
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(catalog[key].trim().length).toBeGreaterThan(0);
      expect(catalog[key].match(/\{\w+\}/g) ?? []).toEqual(en[key].match(/\{\w+\}/g) ?? []);
    }
  }
});
