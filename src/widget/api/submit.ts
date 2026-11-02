import { PageContext } from '../capture/context.js';
import { bufferReport, startAutoSync } from '../storage/report-buffer.js';
import { buildSubmitFormData, MAX_SUBMIT_FORM_BYTES, type MediaItem } from './submit-form.js';
import type { UserActivityCapturePolicy } from '@shared/types';
import { t } from '../i18n/index.js';

// Start auto-sync on module load
startAutoSync();

export type { MediaItem } from './submit-form.js';

export interface SubmitReportInput {
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

/**
 * Check if we're online
 */
function isOnline(): boolean {
  return navigator.onLine !== false;
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

  // If offline, buffer immediately
  if (!isOnline()) {
    console.log('[BugPin] Offline, buffering report for later submission');
    await bufferReport(bufferedReport);

    return {
      success: true,
      message: "Report saved. It will be submitted when you're back online.",
    };
  }

  // Build the URL
  const url = new URL('/api/widget/submit', serverUrl);

  try {
    return await sendSubmitRequest(url.toString(), apiKey, formData, options);
  } catch (error) {
    if (error instanceof SubmissionNetworkError) {
      console.log('[BugPin] Network error, buffering report for later submission');
      await bufferReport(bufferedReport);

      return {
        success: true,
        message: 'Report saved. It will be submitted when the connection is restored.',
      };
    }

    // Re-throw other errors (server errors, validation errors, etc.)
    throw error;
  }
}

/**
 * Fetch widget configuration from the server
 */
export async function fetchWidgetConfig(
  apiKey: string,
  serverUrl: string
): Promise<{
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
