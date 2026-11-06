import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { FormData } from '../components/WidgetDialog.js';
import { CapturedMedia } from '../components/ScreenshotManager.js';

const DB_NAME = 'bugpin-drafts';
const DB_VERSION = 1;
const MEDIA_STORE = 'draft-media';
const DRAFT_KEY_PREFIX = 'bugpin-draft-';
const MEDIA_SAVED_AT_PREFIX = 'bugpin-draft-media-saved-at-';
const MEDIA_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

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
  ownerEmail?: string;
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

function getMediaSavedAtKey(apiKey: string): string {
  return `${MEDIA_SAVED_AT_PREFIX}${apiKey}`;
}

function isExpired(savedAt: string): boolean {
  const timestamp = Date.parse(savedAt);
  return !Number.isFinite(timestamp) || Date.now() - timestamp >= MEDIA_EXPIRY_MS;
}

/**
 * Save form data to localStorage
 */
function normalizeOwnerEmail(ownerEmail?: string): string | undefined {
  const normalized = ownerEmail?.trim().toLowerCase();
  return normalized || undefined;
}

function saveFormDraft(
  apiKey: string,
  formData: FormData,
  activeTab: string,
  ownerEmail?: string
): void {
  try {
    const draft: DraftFormData = {
      formData,
      activeTab,
      ownerEmail: normalizeOwnerEmail(ownerEmail),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(getFormDraftKey(apiKey), JSON.stringify(draft));
  } catch (error) {
    console.error('[BugPin] Failed to save form draft:', error);
    throw error;
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
    const savedAt = new Date().toISOString();
    await database.put(MEDIA_STORE, {
      apiKey,
      media,
      savedAt,
    });
    localStorage.setItem(getMediaSavedAtKey(apiKey), savedAt);
  } catch (error) {
    console.error('[BugPin] Failed to save media draft:', error);
    throw error;
  }
}

/**
 * Load media from IndexedDB
 */
async function loadMediaDraft(apiKey: string): Promise<CapturedMedia[]> {
  try {
    const database = await initDB();
    const data = await database.get(MEDIA_STORE, apiKey);
    if (!data) return [];
    if (isExpired(data.savedAt)) {
      await clearMediaDraft(apiKey);
      return [];
    }
    localStorage.setItem(getMediaSavedAtKey(apiKey), data.savedAt);
    return data?.media || [];
  } catch (error) {
    console.error('[BugPin] Failed to load media draft:', error);
    return [];
  }
}

/**
 * Clear media from IndexedDB
 */
async function clearMediaDraft(apiKey: string): Promise<boolean> {
  try {
    const database = await initDB();
    await database.delete(MEDIA_STORE, apiKey);
    localStorage.removeItem(getMediaSavedAtKey(apiKey));
    return true;
  } catch (error) {
    console.error('[BugPin] Failed to clear media draft:', error);
    return false;
  }
}

async function expireMedia(apiKey: string): Promise<boolean> {
  try {
    const savedAt = localStorage.getItem(getMediaSavedAtKey(apiKey));
    if (!savedAt || !isExpired(savedAt)) return false;
    return await clearMediaDraft(apiKey);
  } catch (error) {
    console.error('[BugPin] Failed to expire draft media:', error);
    return false;
  }
}

/**
 * Check if a draft exists
 */
async function hasDraft(apiKey: string): Promise<boolean> {
  return loadFormDraft(apiKey) !== null;
}

/**
 * Save complete draft (form data + media)
 */
async function saveDraft(
  apiKey: string,
  formData: FormData,
  activeTab: string,
  media: CapturedMedia[],
  ownerEmail?: string
): Promise<void> {
  if (media.length > 0) {
    await saveMediaDraft(apiKey, media);
  } else {
    await clearMediaDraft(apiKey);
  }
  saveFormDraft(apiKey, formData, activeTab, ownerEmail);
}

/**
 * Load complete draft (form data + media)
 */
async function loadDraft(
  apiKey: string,
  ownerEmail?: string
): Promise<{ formData: FormData; activeTab: string; media: CapturedMedia[] } | null> {
  const formDraft = loadFormDraft(apiKey);
  const normalizedOwnerEmail = normalizeOwnerEmail(ownerEmail);

  // Form drafts carry ownerEmail. Media in IndexedDB does not, so a missing
  // localStorage record cannot be attributed to the current reporter.
  if (!formDraft || formDraft.ownerEmail !== normalizedOwnerEmail) {
    await clearDraft(apiKey);
    return null;
  }

  const media = await loadMediaDraft(apiKey);

  return {
    formData: formDraft.formData,
    activeTab: formDraft.activeTab,
    media,
  };
}

/**
 * Clear complete draft (form data + media)
 */
async function clearDraft(apiKey: string): Promise<void> {
  clearFormDraft(apiKey);
  await clearMediaDraft(apiKey);
}

export const draftStorage = {
  save: saveDraft,
  load: loadDraft,
  clear: clearDraft,
  has: hasDraft,
  expireMedia,
};
