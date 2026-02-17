import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { FormData } from '../components/WidgetDialog.js';
import { CapturedMedia } from '../components/ScreenshotManager.js';

const DB_NAME = 'bugpin-drafts';
const DB_VERSION = 1;
const MEDIA_STORE = 'draft-media';
const DRAFT_KEY_PREFIX = 'bugpin-draft-';

interface DraftMediaDB extends DBSchema {
  'draft-media': {
    key: string;
    value: {
      apiKey: string;
      media: CapturedMedia[];
      savedAt: string;
    };
  };
}

interface DraftFormData {
  formData: FormData;
  activeTab: string;
  savedAt: string;
}

let db: IDBPDatabase<DraftMediaDB> | null = null;

/**
 * Initialize the IndexedDB database for media storage
 */
async function initDB(): Promise<IDBPDatabase<DraftMediaDB>> {
  if (db) return db;

  try {
    db = await openDB<DraftMediaDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(MEDIA_STORE)) {
          database.createObjectStore(MEDIA_STORE, { keyPath: 'apiKey' });
        }
      },
    });
    return db;
  } catch (error) {
    console.error('[BugPin] Failed to initialize draft database:', error);
    throw error;
  }
}

/**
 * Get the localStorage key for a specific API key
 */
function getFormDraftKey(apiKey: string): string {
  return `${DRAFT_KEY_PREFIX}${apiKey}`;
}

/**
 * Save form data to localStorage
 */
function saveFormDraft(apiKey: string, formData: FormData, activeTab: string): void {
  try {
    const draft: DraftFormData = {
      formData,
      activeTab,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(getFormDraftKey(apiKey), JSON.stringify(draft));
  } catch (error) {
    console.error('[BugPin] Failed to save form draft:', error);
  }
}

/**
 * Load form data from localStorage
 */
function loadFormDraft(apiKey: string): DraftFormData | null {
  try {
    const data = localStorage.getItem(getFormDraftKey(apiKey));
    if (!data) return null;
    return JSON.parse(data) as DraftFormData;
  } catch (error) {
    console.error('[BugPin] Failed to load form draft:', error);
    return null;
  }
}

/**
 * Clear form data from localStorage
 */
function clearFormDraft(apiKey: string): void {
  try {
    localStorage.removeItem(getFormDraftKey(apiKey));
  } catch (error) {
    console.error('[BugPin] Failed to clear form draft:', error);
  }
}

/**
 * Save media to IndexedDB
 */
async function saveMediaDraft(apiKey: string, media: CapturedMedia[]): Promise<void> {
  try {
    const database = await initDB();
    await database.put(MEDIA_STORE, {
      apiKey,
      media,
      savedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[BugPin] Failed to save media draft:', error);
  }
}

/**
 * Load media from IndexedDB
 */
async function loadMediaDraft(apiKey: string): Promise<CapturedMedia[]> {
  try {
    const database = await initDB();
    const data = await database.get(MEDIA_STORE, apiKey);
    return data?.media || [];
  } catch (error) {
    console.error('[BugPin] Failed to load media draft:', error);
    return [];
  }
}

/**
 * Clear media from IndexedDB
 */
async function clearMediaDraft(apiKey: string): Promise<void> {
  try {
    const database = await initDB();
    await database.delete(MEDIA_STORE, apiKey);
  } catch (error) {
    console.error('[BugPin] Failed to clear media draft:', error);
  }
}

/**
 * Check if a draft exists
 */
export async function hasDraft(apiKey: string): Promise<boolean> {
  const formDraft = loadFormDraft(apiKey);
  if (formDraft) return true;

  try {
    const database = await initDB();
    const mediaDraft = await database.get(MEDIA_STORE, apiKey);
    return mediaDraft !== undefined && mediaDraft.media.length > 0;
  } catch {
    return false;
  }
}

/**
 * Save complete draft (form data + media)
 */
export async function saveDraft(
  apiKey: string,
  formData: FormData,
  activeTab: string,
  media: CapturedMedia[],
): Promise<void> {
  // Save form data to localStorage (fast, synchronous)
  saveFormDraft(apiKey, formData, activeTab);

  // Save media to IndexedDB (can handle large data)
  if (media.length > 0) {
    await saveMediaDraft(apiKey, media);
  } else {
    // Clear media if empty
    await clearMediaDraft(apiKey);
  }
}

/**
 * Load complete draft (form data + media)
 */
export async function loadDraft(
  apiKey: string,
): Promise<{ formData: FormData; activeTab: string; media: CapturedMedia[] } | null> {
  const formDraft = loadFormDraft(apiKey);
  const media = await loadMediaDraft(apiKey);

  // Return null if no draft exists
  if (!formDraft && media.length === 0) {
    return null;
  }

  return {
    formData: formDraft?.formData || {
      title: '',
      description: '',
      priority: 'medium',
      reporterEmail: '',
      reporterName: '',
    },
    activeTab: formDraft?.activeTab || 'details',
    media,
  };
}

/**
 * Clear complete draft (form data + media)
 */
export async function clearDraft(apiKey: string): Promise<void> {
  clearFormDraft(apiKey);
  await clearMediaDraft(apiKey);
}

export const draftStorage = {
  save: saveDraft,
  load: loadDraft,
  clear: clearDraft,
  has: hasDraft,
};
