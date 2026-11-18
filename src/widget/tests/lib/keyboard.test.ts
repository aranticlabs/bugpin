import { afterEach, describe, expect, it } from 'bun:test';
import { matchesShortcut, parseShortcut } from '../../lib/keyboard';

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

function keyEvent(init: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    code: '',
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...init,
  } as KeyboardEvent;
}

describe('parseShortcut', () => {
  it('parses modifiers case-insensitively and maps letters, digits and F-keys to codes', () => {
    expect(parseShortcut('alt+Shift+s')).toEqual({
      ctrl: false,
      alt: true,
      shift: true,
      meta: false,
      code: 'KeyS',
    });
    expect(parseShortcut('Ctrl + 1')?.code).toBe('Digit1');
    expect(parseShortcut('F9')?.code).toBe('F9');
    expect(parseShortcut('Cmd+Option+K')).toMatchObject({ meta: true, alt: true, code: 'KeyK' });
  });

  it('resolves Mod to Cmd on Apple platforms and Ctrl elsewhere', () => {
    setPlatform('MacIntel');
    expect(parseShortcut('Mod+Shift+S')).toMatchObject({ meta: true, ctrl: false });
    setPlatform('Win32');
    expect(parseShortcut('Mod+Shift+S')).toMatchObject({ meta: false, ctrl: true });
  });

  it('rejects unknown modifiers, unsupported keys and bare letters', () => {
    expect(parseShortcut('Hyper+S')).toBeNull();
    expect(parseShortcut('Alt+Enter')).toBeNull();
    expect(parseShortcut('S')).toBeNull();
    expect(parseShortcut('Shift+S')).toBeNull();
    expect(parseShortcut('Shift+F2')?.code).toBe('F2');
    expect(parseShortcut('')).toBeNull();
  });

  it('rejects names inherited from Object instead of treating them as modifiers', () => {
    expect(parseShortcut('constructor+F8')).toBeNull();
    expect(parseShortcut('toString+Shift+S')).toBeNull();
  });
});

describe('matchesShortcut', () => {
  const shortcut = parseShortcut('Alt+Shift+S')!;

  it('matches by code so Option-modified keys still match on macOS', () => {
    expect(
      matchesShortcut(keyEvent({ code: 'KeyS', key: 'Í', altKey: true, shiftKey: true }), shortcut)
    ).toBe(true);
  });

  it('requires the exact modifier set', () => {
    expect(matchesShortcut(keyEvent({ code: 'KeyS', altKey: true }), shortcut)).toBe(false);
    expect(
      matchesShortcut(
        keyEvent({ code: 'KeyS', altKey: true, shiftKey: true, ctrlKey: true }),
        shortcut
      )
    ).toBe(false);
  });
});
