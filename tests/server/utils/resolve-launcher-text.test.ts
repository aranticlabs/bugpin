import { describe, it, expect } from 'bun:test';
import { resolveLauncherText } from '../../../src/server/utils/resolve-launcher-text';

describe('resolveLauncherText', () => {
  const builtinTooltip = 'Built-in tooltip';

  it('returns null when project layer is explicit null', () => {
    expect(resolveLauncherText(null, { en: 'Global' }, 'en', builtinTooltip)).toBeNull();
    expect(resolveLauncherText(null, null, 'de', builtinTooltip)).toBeNull();
  });

  it('returns project active locale when set', () => {
    expect(resolveLauncherText({ en: 'EN', de: 'DE' }, { en: 'GEN' }, 'de', builtinTooltip)).toBe(
      'DE'
    );
  });

  it('falls back to project en within project layer', () => {
    expect(resolveLauncherText({ en: 'EN' }, { en: 'GEN', de: 'GDE' }, 'de', builtinTooltip)).toBe(
      'EN'
    );
  });

  it('falls through to global when project is undefined', () => {
    expect(resolveLauncherText(undefined, { en: 'GEN', de: 'GDE' }, 'de', builtinTooltip)).toBe(
      'GDE'
    );
  });

  it('falls through to global en when global active locale missing', () => {
    expect(resolveLauncherText(undefined, { en: 'GEN' }, 'fr', builtinTooltip)).toBe('GEN');
  });

  it('returns builtin when global is null', () => {
    expect(resolveLauncherText(undefined, null, 'fr', builtinTooltip)).toBe(builtinTooltip);
  });

  it('returns null builtin for buttonText when nothing matches', () => {
    expect(resolveLauncherText(undefined, null, 'fr', null)).toBeNull();
  });

  it('falls through to global when project object lacks usable entries', () => {
    expect(
      resolveLauncherText({ en: '' } as { en: string }, { en: 'GEN' }, 'fr', builtinTooltip)
    ).toBe('GEN');
  });

  it('returns project active even when project en is empty', () => {
    expect(
      resolveLauncherText(
        { en: '', de: 'DE' } as { en: string; de: string },
        { en: 'GEN' },
        'de',
        builtinTooltip
      )
    ).toBe('DE');
  });
});
