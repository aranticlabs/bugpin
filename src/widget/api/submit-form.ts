import { dataUrlToBlob, getExtensionFromDataUrl } from '../capture/screenshot.js';

export type MediaData = { dataUrl: string; blob?: undefined } | { blob: Blob; dataUrl?: undefined };

export type MediaItem = MediaData & {
  mimeType: string;
  annotations?: object;
  source?: 'recording';
};

export interface SubmitFormDataInput {
  title: string;
  description?: string;
  priority: string;
  reporterEmail?: string;
  reporterName?: string;
  locale?: string;
  media?: MediaItem[];
  metadata: object;
}

export const MAX_SUBMIT_FORM_BYTES = 256 * 1024 * 1024;

interface BuiltSubmitFormData {
  formData: FormData;
  byteSize: number;
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export function getExtensionFromMimeType(mimeType: string): string {
  return EXTENSIONS[mimeType] || 'bin';
}

function getMediaBlob(item: MediaData): Blob {
  return item.blob ?? dataUrlToBlob(item.dataUrl);
}

export function buildSubmitFormData(input: SubmitFormDataInput): BuiltSubmitFormData {
  const formData = new FormData();
  const media = input.media ?? [];
  const data = JSON.stringify({
    title: input.title,
    description: input.description,
    priority: input.priority,
    reporterEmail: input.reporterEmail,
    reporterName: input.reporterName,
    locale: input.locale,
    metadata: input.metadata,
    mediaCount: media.length,
    mediaAnnotations: media.map((item) => item.annotations).filter(Boolean),
  });
  let byteSize = new TextEncoder().encode(data).byteLength;

  formData.append('data', data);

  media.forEach((item, index) => {
    const blob = getMediaBlob(item);
    byteSize += blob.size;
    const extension =
      (item.dataUrl !== undefined && getExtensionFromDataUrl(item.dataUrl)) ||
      getExtensionFromMimeType(item.mimeType);
    const isVideo = item.mimeType.startsWith('video/');
    const prefix = item.source === 'recording' ? 'recording' : isVideo ? 'video' : 'screenshot';
    formData.append(
      item.source === 'recording' ? 'recording' : 'media',
      blob,
      `${prefix}-${index}.${extension}`
    );
  });

  return { formData, byteSize };
}
