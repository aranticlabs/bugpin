import { useEffect, useMemo, useRef } from 'preact/hooks';
import { isEditableTarget, matchesShortcut, parseShortcut } from '../lib/keyboard.js';

export function useCaptureShortcut(shortcut: string | undefined, onTrigger: () => void): void {
  const parsed = useMemo(() => {
    if (!shortcut) return null;
    const result = parseShortcut(shortcut);
    if (!result) console.warn(`[BugPin] Ignoring invalid captureShortcut "${shortcut}"`);
    return result;
  }, [shortcut]);
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;

  useEffect(() => {
    if (!parsed) return;

    // Capture phase so host handlers that stop propagation cannot swallow the shortcut.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event) || !matchesShortcut(event, parsed)) return;
      event.preventDefault();
      onTriggerRef.current();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [parsed]);
}
