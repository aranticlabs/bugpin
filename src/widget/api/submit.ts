import { PageContext } from '../capture/context.js';
import { bufferReport, startAutoSync } from '../storage/report-buffer.js';
import {
  buildSubmitFormData,
  createSubmissionId,
  MAX_SUBMIT_FORM_BYTES,
  type MediaItem,
} from './submit-form.js';
import { buildWidgetConfigUrl } from './config-url.js';
import type { RecordingQuality } from '@shared/recording-quality.js';
import type { UserActivityCapturePolicy } from '@shared/types';
import { t } from '../i18n/index.js';

// Start auto-sync on module load
startAutoSync();

export type { MediaItem } from './submit-form.js';

export interface SubmitReportInput {
  submissionId?: string;
  apiKey: string;
  serverUrl: string;
  title: string;
  description?: string;
  priority: 'lowest' | 'low' | 'medium' | 'high' | 'highest';
  reporterEmail?: string;
  reporterName?: string;
  locale?: string;
  media?: MediaItem[];
  metadata: PageContext;
}

interface SubmitResponse {
  success: boolean;
  reportId?: string;
  duplicate?: boolean;
  queued?: boolean;
  message?: string;
  error?: string;
}

export interface SendOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

class SubmissionNetworkError extends Error {
  constructor() {
    super('Network request failed');
    this.name = 'SubmissionNetworkError';
  }
}

const REACHABILITY_TIMEOUT_MS = 5000;

/**
 * Check if we're online
 */
function isOnline(): boolean {
  return navigator.onLine !== false;
}

async function isServerReachable(apiKey: string, serverUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS);
  try {
    await fetch(buildWidgetConfigUrl(apiKey, serverUrl), {
      cache: 'no-store',
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function sendSubmitRequest(
  url: string,
  apiKey: string,
  formData: FormData,
  options: SendOptions
): Promise<SubmitResponse> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new DOMException('Upload canceled', 'AbortError'));
      return;
    }

    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => options.signal?.removeEventListener('abort', abort);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        options.onProgress?.(Math.min(1, event.loaded / event.total));
      }
    };
    xhr.onload = () => {
      cleanup();
      let result: SubmitResponse | null = null;
      try {
        result = JSON.parse(xhr.responseText) as SubmitResponse;
      } catch {
        result = null;
      }

      if (xhr.status < 200 || xhr.status >= 300 || !result?.success) {
        const fallback =
          xhr.status === 413
            ? t('submit.error.tooLarge')
            : `Failed to submit report (HTTP ${xhr.status})`;
        const message =
          result?.error === 'VIDEO_QUOTA_EXCEEDED'
            ? t('submit.error.videoQuota')
            : result?.message || result?.error || fallback;
        reject(new Error(message));
        return;
      }

      resolve(result);
    };
    xhr.onerror = () => {
      cleanup();
      reject(new SubmissionNetworkError());
    };
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException('Upload canceled', 'AbortError'));
    };

    try {
      xhr.open('POST', url);
      xhr.setRequestHeader('x-api-key', apiKey);
      options.signal?.addEventListener('abort', abort, { once: true });
      xhr.send(formData);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

/**
 * Submit a bug report to the server
 * If the submission fails due to network issues, the report is buffered for later retry
 */
export async function submitReport(
  input: SubmitReportInput,
  options: SendOptions = {}
): Promise<SubmitResponse> {
  const { apiKey, serverUrl, media, ...data } = input;
  const bufferedReport = {
    submissionId: data.submissionId ?? createSubmissionId(),
    apiKey,
    serverUrl,
    title: data.title,
    description: data.description,
    priority: data.priority,
    reporterEmail: data.reporterEmail,
    reporterName: data.reporterName,
    locale: data.locale,
    media,
    metadata: data.metadata,
  };

  const { formData, byteSize } = buildSubmitFormData(bufferedReport);
  if (byteSize > MAX_SUBMIT_FORM_BYTES) {
    throw new Error(t('submit.error.tooLarge'));
  }

  const queueReport = async (): Promise<SubmitResponse> => {
    await bufferReport(bufferedReport);
    return { success: true, queued: true, message: t('submit.queued') };
  };

  if (!isOnline()) return queueReport();

  const url = new URL('/api/widget/submit', serverUrl);

  try {
    return await sendSubmitRequest(url.toString(), apiKey, formData, options);
  } catch (error) {
    if (!(error instanceof SubmissionNetworkError)) throw error;

    // A proxy that rejects the upload (413, 502, 504) usually omits CORS headers, so the
    // browser reports it like a dropped connection. If the server still answers a simple
    // request, the upload itself was refused and retrying it later would fail the same way.
    const reachable = await isServerReachable(apiKey, serverUrl);
    if (options.signal?.aborted) throw new DOMException('Upload canceled', 'AbortError');
    if (reachable) throw new Error(t('submit.error.rejected'));
    return queueReport();
  }
}

/**
 * Fetch widget configuration from the server
 */
export async function fetchWidgetConfig(
  apiKey: string,
  serverUrl: string
): Promise<{
  portalUrl?: string | null;
  projectName: string;
  branding: object;
  features: {
    screenshot: boolean;
    annotation: boolean;
    attachments: boolean;
    consoleCapture: boolean;
    networkCapture: boolean;
    storageKeysCapture: boolean;
    userActivityCapture: UserActivityCapturePolicy;
    screenRecording?: boolean;
    recordingMicrophone?: boolean;
  };
  maxRecordingDurationSeconds?: number;
  recordingQuality?: RecordingQuality;
  theme: string;
  position: string;
}> {
  const url = new URL(`/api/widget/config/${apiKey}`, serverUrl);

  const response = await fetch(url.toString());
  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Failed to fetch widget configuration');
  }

  return result.config;
}
