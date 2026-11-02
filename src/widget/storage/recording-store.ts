import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { normalizeMimeType } from '@shared/mime.js';

const DB_NAME = 'bugpin-recordings';
const DB_VERSION = 1;
const SESSION_STORE = 'sessions';
const CHUNK_STORE = 'chunks';
const PENDING_KEY_PREFIX = 'bugpin-recording-pending-';
const HEARTBEAT_KEY_PREFIX = 'bugpin-recording-heartbeat-';
const ACTIVE_SESSION_TTL_MS = 15 * 60 * 1000;
const RECOVERY_SETTLE_MS = 2500;

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

function pendingKey(apiKey: string): string {
  return `${PENDING_KEY_PREFIX}${apiKey}`;
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
  const startedAt = Number(sessionId.split('-', 1)[0]);
  return !Number.isFinite(startedAt) || Date.now() - startedAt > ACTIVE_SESSION_TTL_MS;
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
  if (existingSessionId && !isStaleSessionId(existingSessionId)) return null;

  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  try {
    localStorage.setItem(pendingKey(input.apiKey), sessionId);
    updateHeartbeat(input.apiKey);
    const database = await initDB();
    if (existingSessionId) await deleteSessionRecords(database, existingSessionId);
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
  const previous = writeQueues.get(sessionId)?.catch(() => undefined) ?? Promise.resolve();
  const next = previous.then(async () => {
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
  try {
    const database = await initDB();
    await deleteSessionRecords(database, sessionId);
  } catch (error) {
    console.error('[BugPin] Failed to clear recording recovery storage:', error);
  } finally {
    clearPendingSession(apiKey, sessionId);
    sessionApiKeys.delete(sessionId);
    heartbeatTimes.delete(sessionId);
  }
}

async function recover(apiKey: string, ownerEmail?: string): Promise<RecoveredRecording | null> {
  const sessionId = getPendingSessionId(apiKey);
  if (!sessionId) return null;

  const heartbeat = getHeartbeat(apiKey);
  if (heartbeat) {
    const remaining = RECOVERY_SETTLE_MS - Math.max(0, Date.now() - heartbeat);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining + 10));
      const latestHeartbeat = getHeartbeat(apiKey);
      if (latestHeartbeat && Date.now() - latestHeartbeat < RECOVERY_SETTLE_MS) return null;
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
      await deleteSessionRecords(database, sessionId);
      clearPendingSession(apiKey, sessionId);
      return null;
    }

    const chunks = (await database.getAll(CHUNK_STORE))
      .filter((chunk) => chunk.sessionId === sessionId)
      .sort((left, right) => left.index - right.index);
    if (chunks.length === 0) {
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

export const recordingStore = {
  isStartBlocked,
  begin,
  addChunk,
  touch,
  remove,
  recover,
};
