import { useCallback, useEffect, useState } from 'preact/hooks';

export type RecordingTool = 'cursor' | 'pen' | 'laser';

export interface RecordingStroke {
  color: string;
  points: [number, number][];
}

export const PEN_COLORS = [
  { value: '#ef4444', labelKey: 'recording.color.red' },
  { value: '#f59e0b', labelKey: 'recording.color.amber' },
  { value: '#22c55e', labelKey: 'recording.color.green' },
  { value: '#2e9bc6', labelKey: 'recording.color.blue' },
  { value: '#ffffff', labelKey: 'recording.color.white' },
] as const;

export type PenColor = (typeof PEN_COLORS)[number]['value'];

function isEditableTarget(event: KeyboardEvent): boolean {
  const target = event.composedPath()[0];
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || !!target.closest('input, textarea, select, [contenteditable]');
}

export function useRecordingTools(enabled: boolean) {
  const [tool, setTool] = useState<RecordingTool>('cursor');
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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event)) return;
      const key = event.key.toLowerCase();

      if (event.metaKey || event.ctrlKey) {
        if (key === 'z' && !event.shiftKey && hasStrokes) {
          event.preventDefault();
          undo();
        }
        return;
      }
      if (event.altKey) return;

      if (key === 'escape' || key === 'v') setTool('cursor');
      else if (key === 'p') setTool('pen');
      else if (key === 'l') setTool('laser');
      else if (key === 'c') toggleClickEffects();
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
