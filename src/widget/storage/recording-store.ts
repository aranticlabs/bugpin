import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { normalizeMimeType } from '@shared/mime.js';

const DB_NAME = 'bugpin-recordings';
const DB_VERSION = 1;
const SESSION_STORE = 'sessions';
const CHUNK_STORE = 'chunks';
const PENDING_KEY_PREFIX = 'bugpin-recording-pending-';
const HEARTBEAT_KEY_PREFIX = 'bugpin-recording-heartbeat-';
const OWNER_TAB_KEY_PREFIX = 'bugpin-recording-owner-tab-';
const TAB_ID_KEY = 'bugpin-recording-tab-id';
const STORAGE_USED_KEY = 'bugpin-recording-storage-used';
const ACTIVE_SESSION_TTL_MS = 15 * 60 * 1000;
const RECOVERY_LIVENESS_MS = 90 * 1000;
const RECORDING_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

interface RecordingSessionRecord {
  id: string;
  apiKey: string;
  ownerEmail?: string;
  mimeType: string;
  startedAt: string;
  hasAudio: boolean;
}

interface RecordingChunkRecord {
  id: string;
  sessionId: string;
  index: number;
  blob: Blob;
  durationMs: number;
}

interface RecordingStoreDB extends DBSchema {
  sessions: {
    key: string;
    value: RecordingSessionRecord;
  };
  chunks: {
    key: string;
    value: RecordingChunkRecord;
  };
}

export interface BeginRecordingInput {
  apiKey: string;
  ownerEmail?: string;
  mimeType: string;
  hasAudio: boolean;
}

export interface RecoveredRecording {
  sessionId: string;
  blob: Blob;
  mimeType: string;
  durationMs: number;
  startedAt: string;
  hasAudio: boolean;
}

let db: IDBPDatabase<RecordingStoreDB> | null = null;
const writeQueues = new Map<string, Promise<void>>();
const sessionApiKeys = new Map<string, string>();
const heartbeatTimes = new Map<string, number>();
const closedSessions = new Set<string>();
let tabId: string | null = null;

function pendingKey(apiKey: string): string {
  return `${PENDING_KEY_PREFIX}${apiKey}`;
}

function ownerTabKey(apiKey: string): string {
  return `${OWNER_TAB_KEY_PREFIX}${apiKey}`;
}

function getTabId(): string {
  if (tabId) return tabId;
  try {
    tabId = window.sessionStorage.getItem(TAB_ID_KEY);
    if (!tabId) {
      tabId = crypto.randomUUID();
      window.sessionStorage.setItem(TAB_ID_KEY, tabId);
    }
  } catch {
    tabId = crypto.randomUUID();
  }
  return tabId;
}

function normalizeOwnerEmail(ownerEmail?: string): string | undefined {
  const normalized = ownerEmail?.trim().toLowerCase();
  return normalized || undefined;
}

function getPendingSessionId(apiKey: string): string | null {
  try {
    return localStorage.getItem(pendingKey(apiKey));
  } catch {
    return null;
  }
}

function clearPendingSession(apiKey: string, sessionId: string): void {
  try {
    if (localStorage.getItem(pendingKey(apiKey)) === sessionId) {
      localStorage.removeItem(pendingKey(apiKey));
      localStorage.removeItem(`${HEARTBEAT_KEY_PREFIX}${apiKey}`);
      localStorage.removeItem(ownerTabKey(apiKey));
    }
  } catch {
    // IndexedDB remains the source for cleanup if local storage is unavailable.
  }
}

function updateHeartbeat(apiKey: string): void {
  try {
    localStorage.setItem(`${HEARTBEAT_KEY_PREFIX}${apiKey}`, String(Date.now()));
  } catch {
    // Recovery still works, but cannot distinguish a concurrent active tab.
  }
}

function touch(sessionId: string): void {
  const apiKey = sessionApiKeys.get(sessionId);
  if (!apiKey) return;
  const now = Date.now();
  if (now - (heartbeatTimes.get(sessionId) ?? 0) < 1000) return;
  heartbeatTimes.set(sessionId, now);
  updateHeartbeat(apiKey);
}

function getHeartbeat(apiKey: string): number | null {
  try {
    const value = Number(localStorage.getItem(`${HEARTBEAT_KEY_PREFIX}${apiKey}`));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function isStaleSessionId(sessionId: string): boolean {
  const startedAt = sessionStartedAt(sessionId);
  return !Number.isFinite(startedAt) || Date.now() - startedAt > ACTIVE_SESSION_TTL_MS;
}

function sessionStartedAt(sessionId: string): number {
  return Number(sessionId.split('-', 1)[0]);
}

async function initDB(): Promise<IDBPDatabase<RecordingStoreDB>> {
  if (db) return db;
  db = await openDB<RecordingStoreDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(SESSION_STORE)) {
        database.createObjectStore(SESSION_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(CHUNK_STORE)) {
        database.createObjectStore(CHUNK_STORE, { keyPath: 'id' });
      }
    },
  });
  return db;
}

async function deleteSessionRecords(
  database: IDBPDatabase<RecordingStoreDB>,
  sessionId: string
): Promise<void> {
  await writeQueues.get(sessionId)?.catch(() => undefined);
  const chunks = await database.getAll(CHUNK_STORE);
  await Promise.all(
    chunks
      .filter((chunk) => chunk.sessionId === sessionId)
      .map((chunk) => database.delete(CHUNK_STORE, chunk.id))
  );
  await database.delete(SESSION_STORE, sessionId);
  writeQueues.delete(sessionId);
}

function isStartBlocked(apiKey: string): boolean {
  const sessionId = getPendingSessionId(apiKey);
  return sessionId !== null && !isStaleSessionId(sessionId);
}

async function begin(input: BeginRecordingInput): Promise<string | null> {
  const existingSessionId = getPendingSessionId(input.apiKey);
  if (existingSessionId) return null;

  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  try {
    localStorage.setItem(pendingKey(input.apiKey), sessionId);
    localStorage.setItem(ownerTabKey(input.apiKey), getTabId());
    localStorage.setItem(STORAGE_USED_KEY, 'true');
    updateHeartbeat(input.apiKey);
    const database = await initDB();
    await database.put(SESSION_STORE, {
      id: sessionId,
      apiKey: input.apiKey,
      ownerEmail: normalizeOwnerEmail(input.ownerEmail),
      mimeType: normalizeMimeType(input.mimeType),
      startedAt: new Date().toISOString(),
      hasAudio: input.hasAudio,
    });
    sessionApiKeys.set(sessionId, input.apiKey);
    heartbeatTimes.set(sessionId, Date.now());
    return sessionId;
  } catch (error) {
    console.error('[BugPin] Failed to start recording recovery storage:', error);
    clearPendingSession(input.apiKey, sessionId);
    return null;
  }
}

async function addChunk(
  sessionId: string,
  index: number,
  blob: Blob,
  durationMs: number
): Promise<void> {
  if (closedSessions.has(sessionId)) return;
  const previous = writeQueues.get(sessionId)?.catch(() => undefined) ?? Promise.resolve();
  const next = previous.then(async () => {
    if (closedSessions.has(sessionId)) return;
    const database = await initDB();
    await database.put(CHUNK_STORE, {
      id: `${sessionId}:${index}`,
      sessionId,
      index,
      blob,
      durationMs,
    });
    touch(sessionId);
  });
  writeQueues.set(sessionId, next);
  try {
    await next;
  } catch (error) {
    console.error('[BugPin] Failed to store recording chunk:', error);
  }
}

async function remove(apiKey: string, sessionId: string): Promise<void> {
  closedSessions.add(sessionId);
  try {
    const database = await initDB();
    await deleteSessionRecords(database, sessionId);
    clearPendingSession(apiKey, sessionId);
    sessionApiKeys.delete(sessionId);
    heartbeatTimes.delete(sessionId);
  } catch (error) {
    console.error('[BugPin] Failed to clear recording recovery storage:', error);
  }
}

async function recover(apiKey: string, ownerEmail?: string): Promise<RecoveredRecording | null> {
  const sessionId = getPendingSessionId(apiKey);
  if (!sessionId) return null;

  let ownerTabId: string | null = null;
  try {
    ownerTabId = localStorage.getItem(ownerTabKey(apiKey));
  } catch {
    // Heartbeat expiry remains the fallback when storage is unavailable.
  }
  if (ownerTabId !== getTabId()) {
    let heartbeat = getHeartbeat(apiKey);
    while (heartbeat && Date.now() - heartbeat < RECOVERY_LIVENESS_MS) {
      const remaining = RECOVERY_LIVENESS_MS - Math.max(0, Date.now() - heartbeat);
      await new Promise((resolve) => setTimeout(resolve, remaining + 10));
      heartbeat = getHeartbeat(apiKey);
    }
  }

  try {
    const database = await initDB();
    const session = await database.get(SESSION_STORE, sessionId);
    if (!session || session.apiKey !== apiKey) {
      clearPendingSession(apiKey, sessionId);
      return null;
    }
    if (session.ownerEmail !== normalizeOwnerEmail(ownerEmail)) {
      closedSessions.add(sessionId);
      await deleteSessionRecords(database, sessionId);
      clearPendingSession(apiKey, sessionId);
      return null;
    }

    const chunks = (await database.getAll(CHUNK_STORE))
      .filter((chunk) => chunk.sessionId === sessionId)
      .sort((left, right) => left.index - right.index);
    if (chunks.length === 0) {
      closedSessions.add(sessionId);
      await deleteSessionRecords(database, sessionId);
      clearPendingSession(apiKey, sessionId);
      return null;
    }

    return {
      sessionId,
      blob: new Blob(
        chunks.map((chunk) => chunk.blob),
        { type: session.mimeType }
      ),
      mimeType: session.mimeType,
      durationMs: Math.max(...chunks.map((chunk) => chunk.durationMs)),
      startedAt: session.startedAt,
      hasAudio: session.hasAudio,
    };
  } catch (error) {
    console.error('[BugPin] Failed to recover recording:', error);
    return null;
  }
}

async function expire(): Promise<boolean> {
  try {
    if (localStorage.getItem(STORAGE_USED_KEY) !== 'true') return false;
    const database = await initDB();
    const [sessions, chunks] = await Promise.all([
      database.getAll(SESSION_STORE),
      database.getAll(CHUNK_STORE),
    ]);
    const cutoff = Date.now() - RECORDING_EXPIRY_MS;
    const expiredSessionIds = new Set(
      sessions
        .filter((session) => {
          const startedAt = Date.parse(session.startedAt);
          return !Number.isFinite(startedAt) || startedAt <= cutoff;
        })
        .map((session) => session.id)
    );
    const expiredChunks = chunks.filter((chunk) => {
      const startedAt = sessionStartedAt(chunk.sessionId);
      return (
        expiredSessionIds.has(chunk.sessionId) || !Number.isFinite(startedAt) || startedAt <= cutoff
      );
    });

    await Promise.all([
      ...expiredChunks.map((chunk) => database.delete(CHUNK_STORE, chunk.id)),
      ...[...expiredSessionIds].map((sessionId) => database.delete(SESSION_STORE, sessionId)),
    ]);
    sessions
      .filter((session) => expiredSessionIds.has(session.id))
      .forEach((session) => clearPendingSession(session.apiKey, session.id));

    const [remainingSessions, remainingChunks] = await Promise.all([
      database.count(SESSION_STORE),
      database.count(CHUNK_STORE),
    ]);
    if (remainingSessions === 0 && remainingChunks === 0) {
      localStorage.removeItem(STORAGE_USED_KEY);
    }
    return expiredSessionIds.size > 0 || expiredChunks.length > 0;
  } catch (error) {
    console.error('[BugPin] Failed to expire recording recovery storage:', error);
    return false;
  }
}

export const recordingStore = {
  isStartBlocked,
  begin,
  addChunk,
  touch,
  remove,
  recover,
  expire,
};
