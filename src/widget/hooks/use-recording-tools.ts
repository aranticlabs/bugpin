import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

export type RecordingTool = 'cursor' | 'pen' | 'laser';

export interface StrokeClip {
  element: Element;
  // How far the stroke reached past the element's padding box while it was drawn.
  outset: number;
}

export interface StrokeAnchor {
  element: Element;
  // Content coordinates move with the element's own scrolling; box coordinates do not.
  followsScroll: boolean;
  // Overflow containers the stroke stayed (nearly) inside; they clip it when it moves.
  clips: StrokeClip[];
}

export interface RecordingStroke {
  color: string;
  // Points are relative to the anchor's origin, or document coordinates without an anchor.
  points: [number, number][];
  anchor?: StrokeAnchor;
}

export const PEN_COLORS = [
  { value: '#ef4444', labelKey: 'recording.color.red' },
  { value: '#f59e0b', labelKey: 'recording.color.amber' },
  { value: '#22c55e', labelKey: 'recording.color.green' },
  { value: '#2e9bc6', labelKey: 'recording.color.blue' },
  { value: '#ffffff', labelKey: 'recording.color.white' },
] as const;

export type PenColor = (typeof PEN_COLORS)[number]['value'];

const SHORTCUT_CODES: Record<string, 'cursor' | 'pen' | 'laser' | 'clickEffects' | 'undo'> = {
  KeyV: 'cursor',
  KeyP: 'pen',
  KeyL: 'laser',
  KeyC: 'clickEffects',
  KeyZ: 'undo',
};

function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

export function formatShortcut(letter: string): string {
  return isApplePlatform() ? `\u2325${letter}` : `Alt+${letter}`;
}

function isEditableTarget(event: KeyboardEvent): boolean {
  const target = event.composedPath()[0];
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || !!target.closest('input, textarea, select, [contenteditable]');
}

export function useRecordingTools(enabled: boolean) {
  const [tool, setTool] = useState<RecordingTool>('cursor');
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const [clickEffects, setClickEffects] = useState(true);
  const [color, setColor] = useState<PenColor>(PEN_COLORS[0].value);
  const [strokes, setStrokes] = useState<RecordingStroke[]>([]);

  const addStroke = useCallback((stroke: RecordingStroke) => {
    setStrokes((current) => [...current, stroke]);
  }, []);
  const undo = useCallback(() => setStrokes((current) => current.slice(0, -1)), []);
  const clear = useCallback(() => setStrokes([]), []);
  const toggleClickEffects = useCallback(() => setClickEffects((current) => !current), []);

  const hasStrokes = strokes.length > 0;

  useEffect(() => {
    if (!enabled) return;

    // Shortcuts need Alt/Option so plain keys keep reaching the page being recorded.
    // event.code is used because Option changes event.key on macOS.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event)) return;
      if (event.key === 'Escape') {
        if (toolRef.current !== 'cursor' && !event.altKey && !event.ctrlKey && !event.metaKey) {
          setTool('cursor');
        }
        return;
      }
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      const action = SHORTCUT_CODES[event.code];
      if (!action || (action === 'undo' && !hasStrokes)) return;
      event.preventDefault();
      if (action === 'clickEffects') toggleClickEffects();
      else if (action === 'undo') undo();
      else setTool(action);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, hasStrokes, toggleClickEffects, undo]);

  return {
    tool,
    setTool,
    clickEffects,
    toggleClickEffects,
    color,
    setColor,
    strokes,
    addStroke,
    undo,
    clear,
  };
}
