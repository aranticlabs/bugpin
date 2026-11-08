import type { GlobalWidgetLauncherButtonSettings } from '@shared/types';

type LauncherPosition = GlobalWidgetLauncherButtonSettings['position'];
export type SizeUnit = GlobalWidgetLauncherButtonSettings['buttonSizeUnit'];

export type SizeField = 'offset' | 'icon';

interface SizeRange {
  min: number;
  max: number;
  step: number;
}

export const SIZE_RANGES: Record<SizeField, Record<SizeUnit, SizeRange>> = {
  offset: {
    px: { min: 0, max: 200, step: 1 },
    rem: { min: 0, max: 12.5, step: 0.05 },
  },
  icon: {
    px: { min: 12, max: 32, step: 1 },
    rem: { min: 0.75, max: 2, step: 0.125 },
  },
};

// Matches the browser default root font size; the real rem value depends on the host page.
const PX_PER_REM = 16;

export const EDGE_LABELS: Record<string, string> = {
  top: 'Top',
  bottom: 'Bottom',
  left: 'Left',
  right: 'Right',
};

export function splitPosition(position: LauncherPosition): {
  vertical: string;
  horizontal: string;
} {
  const [vertical, horizontal] = position.split('-');
  return { vertical, horizontal };
}

export function clampSize(size: number, field: SizeField, unit: SizeUnit): number {
  const { min, max, step } = SIZE_RANGES[field][unit];
  const snapped = Number((Math.round(size / step) * step).toFixed(3));
  return Math.min(Math.max(snapped, min), max);
}

// An empty or partial entry yields undefined so the field keeps its last valid value.
export function parseSize(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toPx(size: number, unit: SizeUnit): number {
  return unit === 'rem' ? size * PX_PER_REM : size;
}

export function convertSize(size: number, field: SizeField, from: SizeUnit, to: SizeUnit): number {
  if (from === to) return size;
  const px = toPx(size, from);
  return clampSize(to === 'rem' ? px / PX_PER_REM : px, field, to);
}

export function describeRange(field: SizeField, unit: SizeUnit): string {
  const { min, max } = SIZE_RANGES[field][unit];
  return `${min} to ${max} ${unit}.`;
}
