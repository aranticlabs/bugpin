import { afterEach, describe, expect, it } from 'bun:test';
import { formatShortcut } from '../../hooks/use-recording-tools';

const originalNavigator = globalThis.navigator;

function setPlatform(platform: string): void {
  Object.defineProperty(globalThis, 'navigator', {
    value: { platform, userAgent: platform },
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
});

describe('formatShortcut', () => {
  it('uses the Option symbol on Apple platforms', () => {
    setPlatform('MacIntel');
    expect(formatShortcut('P')).toBe('⌥P');
  });

  it('uses Alt+ elsewhere', () => {
    setPlatform('Win32');
    expect(formatShortcut('P')).toBe('Alt+P');
  });
});
