import { PageContext } from '../capture/context.js';
import { dataUrlToBlob, getExtensionFromDataUrl } from '../capture/screenshot.js';
import { bufferReport, startAutoSync } from '../storage/report-buffer.js';

// Start auto-sync on module load
startAutoSync();

export interface MediaItem {
  dataUrl: string;
  mimeType: string;
  annotations?: object;
}

export interface SubmitReportInput {
  apiKey: string;
  serverUrl: string;
  title: string;
  description?: string;
  priority: 'lowest' | 'low' | 'medium' | 'high' | 'highest';
  reporterEmail?: string;
  reporterName?: string;
  media?: MediaItem[];
  metadata: PageContext;
}

interface SubmitResponse {
  success: boolean;
  reportId?: string;
  message?: string;
  error?: string;
}

/**
 * Check if we're online
 */
function isOnline(): boolean {
  return navigator.onLine !== false;
}

/**
 * Get file extension from mime type
 */
function getExtensionFromMimeType(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
  };
  return mimeMap[mimeType] || 'bin';
}

/**
 * Submit a bug report to the server
 * If the submission fails due to network issues, the report is buffered for later retry
 */
export async function submitReport(input: SubmitReportInput): Promise<SubmitResponse> {
  const { apiKey, serverUrl, media, ...data } = input;

  // If offline, buffer immediately
  if (!isOnline()) {
    console.log('[BugPin] Offline, buffering report for later submission');
    await bufferReport({
      apiKey,
      serverUrl,
      title: data.title,
      description: data.description,
      priority: data.priority,
      reporterEmail: data.reporterEmail,
      reporterName: data.reporterName,
      media,
      metadata: data.metadata,
    });

    return {
      success: true,
      message: "Report saved. It will be submitted when you're back online.",
    };
  }

  // Build the URL
  const url = new URL('/api/widget/submit', serverUrl);

  // Create form data for multipart upload
  const formData = new FormData();

  // Add JSON data
  formData.append(
    'data',
    JSON.stringify({
      title: data.title,
      description: data.description,
      priority: data.priority,
      reporterEmail: data.reporterEmail,
      reporterName: data.reporterName,
      metadata: data.metadata,
      mediaCount: media?.length || 0,
      mediaAnnotations: media?.map((item) => item.annotations).filter(Boolean),
    }),
  );

  // Add media files
  if (media && media.length > 0) {
    for (let i = 0; i < media.length; i++) {
      const item = media[i];
      const blob = dataUrlToBlob(item.dataUrl);
      const ext = getExtensionFromDataUrl(item.dataUrl) || getExtensionFromMimeType(item.mimeType);
      const isVideo = item.mimeType.startsWith('video/');
      const prefix = isVideo ? 'video' : 'screenshot';

      // Debug: Log sizes
      console.log(
        `[BugPin] Media ${i}: dataUrl length=${item.dataUrl.length}, blob size=${blob.size}, type=${blob.type}`,
      );

      formData.append('media', blob, `${prefix}-${i}.${ext}`);
    }
  }

  try {
    // Submit the report with API key in header
    const response = await fetch(url.toString(), {
      method: 'POST',
      body: formData,
      headers: {
        'x-api-key': apiKey,
      },
    });

    // Parse response
    const result = (await response.json()) as SubmitResponse;

    if (!response.ok || !result.success) {
      throw new Error(result.message || result.error || 'Failed to submit report');
    }

    return result;
  } catch (error) {
    // Check if it's a network error (not a server error)
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.log('[BugPin] Network error, buffering report for later submission');

      await bufferReport({
        apiKey,
        serverUrl,
        title: data.title,
        description: data.description,
        priority: data.priority,
        reporterEmail: data.reporterEmail,
        reporterName: data.reporterName,
        media,
        metadata: data.metadata,
      });

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
  serverUrl: string,
): Promise<{
  projectName: string;
  branding: object;
  features: {
    screenshot: boolean;
    annotation: boolean;
    attachments: boolean;
    consoleCapture: boolean;
  };
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
