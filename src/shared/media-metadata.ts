import type { RecordingQuality } from './recording-quality';

export interface MediaMetadata {
  width?: number;
  height?: number;
  capturedAt?: string;
  durationMs?: number;
  recordingQuality?: RecordingQuality;
}

export function formatMediaDetails(
  media: MediaMetadata & { sizeBytes?: number },
  locale: string
): string {
  const details: string[] = [];
  if (media.width && media.height) details.push(`${media.width} x ${media.height}`);
  if (media.durationMs !== undefined && Number.isFinite(media.durationMs)) {
    const seconds = Math.floor(media.durationMs / 1000);
    details.push(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
  }
  if (media.sizeBytes !== undefined) {
    const sizeMb = Math.max(media.sizeBytes / (1024 * 1024), 0.1);
    try {
      details.push(
        new Intl.NumberFormat(locale, {
          style: 'unit',
          unit: 'megabyte',
          unitDisplay: 'short',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(sizeMb)
      );
    } catch {
      details.push(`${sizeMb.toFixed(1)} MB`);
    }
  }
  return details.join(' · ');
}
