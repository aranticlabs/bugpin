export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

export function isEditableTarget(event: Event): boolean {
  const target = event.composedPath()[0];
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || !!target.closest('input, textarea, select, [contenteditable]');
}

export interface KeyboardShortcut {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  code: string;
}

const MODIFIER_ALIASES: Record<string, keyof Omit<KeyboardShortcut, 'code'> | 'mod'> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  option: 'alt',
  shift: 'shift',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
  mod: 'mod',
};

function keyToCode(key: string): string | null {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  if (/^f([1-9]|1[0-2])$/i.test(key)) return key.toUpperCase();
  return null;
}

/**
 * Parses shortcuts such as "Alt+Shift+S" or "Mod+Shift+1". "Mod" means Cmd on
 * Apple platforms and Ctrl elsewhere. Letters and digits are matched by
 * `event.code` because Option changes `event.key` on macOS. Letters and digits need
 * Ctrl, Alt or Meta (Shift alone still types text); function keys need no modifier.
 */
export function parseShortcut(value: string): KeyboardShortcut | null {
  const parts = value
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  const key = parts.pop();
  if (!key) return null;

  const shortcut: KeyboardShortcut = {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    code: '',
  };
  for (const part of parts) {
    const name = part.toLowerCase();
    const modifier = Object.prototype.hasOwnProperty.call(MODIFIER_ALIASES, name)
      ? MODIFIER_ALIASES[name]
      : undefined;
    if (!modifier) return null;
    if (modifier === 'mod') {
      if (isApplePlatform()) shortcut.meta = true;
      else shortcut.ctrl = true;
    } else {
      shortcut[modifier] = true;
    }
  }

  const code = keyToCode(key);
  if (!code) return null;
  const hasModifier = shortcut.ctrl || shortcut.alt || shortcut.meta;
  if (!hasModifier && !code.startsWith('F')) return null;
  shortcut.code = code;
  return shortcut;
}

export function matchesShortcut(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
  return (
    event.code === shortcut.code &&
    event.ctrlKey === shortcut.ctrl &&
    event.altKey === shortcut.alt &&
    event.shiftKey === shortcut.shift &&
    event.metaKey === shortcut.meta
  );
}
