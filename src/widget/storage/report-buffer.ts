import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { MediaItem } from '../api/submit.js';
import { dataUrlToBlob, getExtensionFromDataUrl } from '../capture/screenshot.js';

const DB_NAME = 'bugpin-reports';
const DB_VERSION = 2; // Bump version for schema change
const STORE_NAME = 'pending-reports';

// Retry configuration
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 5000; // 5 seconds
const MAX_RETRY_DELAY = 300000; // 5 minutes
const BACKOFF_MULTIPLIER = 2;

interface PendingReport {
  id: string;
  apiKey: string;
  serverUrl: string;
  title: string;
  description?: string;
  priority: string;
  reporterEmail?: string;
  reporterName?: string;
  media?: MediaItem[];
  metadata: object;
  createdAt: string;
  retryCount: number;
  lastRetryAt?: string;
  error?: string;
}

interface ReportBufferDB extends DBSchema {
  'pending-reports': {
    key: string;
    value: PendingReport;
    indexes: {
      'by-created': string;
    };
  };
}

let db: IDBPDatabase<ReportBufferDB> | null = null;
let syncInterval: ReturnType<typeof setInterval> | null = null;

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
 * Initialize the IndexedDB database
 */
async function initDB(): Promise<IDBPDatabase<ReportBufferDB>> {
  if (db) return db;

  try {
    db = await openDB<ReportBufferDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('by-created', 'createdAt');
        }
      },
    });
    return db;
  } catch (error) {
    console.error('[BugPin] Failed to initialize IndexedDB:', error);
    throw error;
  }
}

/**
 * Generate a unique ID for pending reports
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Check if we're online
 */
function isOnline(): boolean {
  return navigator.onLine !== false;
}

/**
 * Calculate next retry delay with exponential backoff
 */
function getRetryDelay(retryCount: number): number {
  const delay = INITIAL_RETRY_DELAY * Math.pow(BACKOFF_MULTIPLIER, retryCount);
  return Math.min(delay, MAX_RETRY_DELAY);
}

/**
 * Add a report to the buffer (for offline storage)
 */
export async function bufferReport(
  report: Omit<PendingReport, 'id' | 'createdAt' | 'retryCount'>,
): Promise<string> {
  const database = await initDB();

  const pendingReport: PendingReport = {
    ...report,
    id: generateId(),
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };

  await database.put(STORE_NAME, pendingReport);

  console.log('[BugPin] Report buffered for later submission:', pendingReport.id);

  // Try to sync if we're online
  if (isOnline()) {
    // Don't await - let it happen in background
    syncPendingReports().catch(console.error);
  }

  return pendingReport.id;
}

/**
 * Get all pending reports
 */
export async function getPendingReports(): Promise<PendingReport[]> {
  try {
    const database = await initDB();
    return await database.getAllFromIndex(STORE_NAME, 'by-created');
  } catch {
    return [];
  }
}

/**
 * Get count of pending reports
 */
export async function getPendingCount(): Promise<number> {
  try {
    const database = await initDB();
    return await database.count(STORE_NAME);
  } catch {
    return 0;
  }
}

/**
 * Remove a report from the buffer
 */
export async function removeBufferedReport(id: string): Promise<void> {
  try {
    const database = await initDB();
    await database.delete(STORE_NAME, id);
    console.log('[BugPin] Removed buffered report:', id);
  } catch (error) {
    console.error('[BugPin] Failed to remove buffered report:', error);
  }
}

/**
 * Update a buffered report (e.g., after a failed retry)
 */
async function updateBufferedReport(report: PendingReport): Promise<void> {
  try {
    const database = await initDB();
    await database.put(STORE_NAME, report);
  } catch (error) {
    console.error('[BugPin] Failed to update buffered report:', error);
  }
}

/**
 * Submit a single report to the server
 */
async function submitReport(report: PendingReport): Promise<boolean> {
  try {
    // Build URL
    const url = new URL('/api/widget/submit', report.serverUrl);

    // Create form data
    const formData = new FormData();

    // Add JSON data
    formData.append(
      'data',
      JSON.stringify({
        title: report.title,
        description: report.description,
        priority: report.priority,
        reporterEmail: report.reporterEmail,
        reporterName: report.reporterName,
        metadata: report.metadata,
        mediaCount: report.media?.length || 0,
        mediaAnnotations: report.media?.map((item) => item.annotations).filter(Boolean),
      }),
    );

    // Add media files
    if (report.media && report.media.length > 0) {
      for (let i = 0; i < report.media.length; i++) {
        const item = report.media[i];
        const blob = dataUrlToBlob(item.dataUrl);
        const ext =
          getExtensionFromDataUrl(item.dataUrl) || getExtensionFromMimeType(item.mimeType);
        const isVideo = item.mimeType.startsWith('video/');
        const prefix = isVideo ? 'video' : 'screenshot';
        formData.append('media', blob, `${prefix}-${i}.${ext}`);
      }
    }

    const serverResponse = await fetch(url.toString(), {
      method: 'POST',
      body: formData,
      headers: {
        'x-api-key': report.apiKey,
      },
    });

    if (!serverResponse.ok) {
      const errorData = await serverResponse.json().catch(() => ({}));
      throw new Error(
        (errorData as { message?: string }).message || `HTTP ${serverResponse.status}`,
      );
    }

    return true;
  } catch (error) {
    console.error('[BugPin] Failed to submit buffered report:', error);
    throw error;
  }
}

/**
 * Sync all pending reports to the server
 */
export async function syncPendingReports(): Promise<{ synced: number; failed: number }> {
  if (!isOnline()) {
    console.log('[BugPin] Offline, skipping sync');
    return { synced: 0, failed: 0 };
  }

  const pending = await getPendingReports();

  if (pending.length === 0) {
    return { synced: 0, failed: 0 };
  }

  console.log(`[BugPin] Syncing ${pending.length} pending reports...`);

  let synced = 0;
  let failed = 0;

  for (const report of pending) {
    // Check if enough time has passed since last retry
    if (report.lastRetryAt) {
      const lastRetry = new Date(report.lastRetryAt).getTime();
      const nextRetryAt = lastRetry + getRetryDelay(report.retryCount);
      if (Date.now() < nextRetryAt) {
        continue; // Skip, not time yet
      }
    }

    try {
      await submitReport(report);
      await removeBufferedReport(report.id);
      synced++;
      console.log('[BugPin] Successfully synced report:', report.id);
    } catch (error) {
      failed++;

      // Update retry count
      report.retryCount++;
      report.lastRetryAt = new Date().toISOString();
      report.error = error instanceof Error ? error.message : 'Unknown error';

      // If max retries exceeded, remove the report
      if (report.retryCount >= MAX_RETRIES) {
        console.error('[BugPin] Max retries exceeded, removing report:', report.id);
        await removeBufferedReport(report.id);
      } else {
        await updateBufferedReport(report);
        console.log(
          `[BugPin] Report retry scheduled (attempt ${report.retryCount}/${MAX_RETRIES}):`,
          report.id,
        );
      }
    }
  }

  return { synced, failed };
}

/**
 * Start automatic sync when coming back online
 */
export function startAutoSync(): void {
  // Sync when coming back online
  window.addEventListener('online', () => {
    console.log('[BugPin] Back online, syncing pending reports...');
    syncPendingReports().catch(console.error);
  });

  // Periodic sync every 30 seconds
  if (!syncInterval) {
    syncInterval = setInterval(() => {
      if (isOnline()) {
        syncPendingReports().catch(console.error);
      }
    }, 30000);
  }

  // Initial sync
  if (isOnline()) {
    syncPendingReports().catch(console.error);
  }
}

/**
 * Stop automatic sync
 */
export function stopAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

/**
 * Clear all pending reports (for testing/debugging)
 */
export async function clearBuffer(): Promise<void> {
  try {
    const database = await initDB();
    await database.clear(STORE_NAME);
    console.log('[BugPin] Buffer cleared');
  } catch (error) {
    console.error('[BugPin] Failed to clear buffer:', error);
  }
}

export const reportBuffer = {
  buffer: bufferReport,
  getPending: getPendingReports,
  getCount: getPendingCount,
  remove: removeBufferedReport,
  sync: syncPendingReports,
  startAutoSync,
  stopAutoSync,
  clear: clearBuffer,
};
