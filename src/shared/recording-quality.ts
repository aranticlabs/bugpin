export const RECORDING_QUALITIES = ['low', 'standard', 'high'] as const;

export type RecordingQuality = (typeof RECORDING_QUALITIES)[number];

export const RECORDING_QUALITY_LABELS: Record<RecordingQuality, string> = {
  low: 'Low',
  standard: 'Standard',
  high: 'High',
};

export const DEFAULT_RECORDING_QUALITY: RecordingQuality = 'standard';

export interface RecordingQualityPreset {
  width: number;
  height: number;
  frameRate: number;
  videoBitsPerSecond: number;
}

export const RECORDING_QUALITY_PRESETS: Record<RecordingQuality, RecordingQualityPreset> = {
  low: { width: 1280, height: 720, frameRate: 10, videoBitsPerSecond: 800_000 },
  standard: { width: 1920, height: 1080, frameRate: 15, videoBitsPerSecond: 1_500_000 },
  high: { width: 2560, height: 1440, frameRate: 30, videoBitsPerSecond: 4_000_000 },
};

export function estimateRecordingSizeMb(
  quality: RecordingQuality,
  durationSeconds: number
): number {
  return (RECORDING_QUALITY_PRESETS[quality].videoBitsPerSecond / 8 / 1_000_000) * durationSeconds;
}
