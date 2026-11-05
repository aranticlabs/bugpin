import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { normalizeMimeType } from '@shared/mime.js';

const DB_NAME = 'bugpin-recordings';
const DB_VERSION = 1;
const SESSION_STORE = 'sessions';
const CHUNK_STORE = 'chunks';
const PENDING_KEY_PREFIX = 'bugpin-recording-pending-';
const HEARTBEAT_KEY_PREFIX = 'bugpin-recording-heartbeat-';
const STORAGE_USED_KEY = 'bugpin-recording-storage-used';
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
let pageHideListenerInstalled = false;

function pendingKey(apiKey: string): string {
  return `${PENDING_KEY_PREFIX}${apiKey}`;
}

function heartbeatKey(apiKey: string): string {
  return `${HEARTBEAT_KEY_PREFIX}${apiKey}`;
}

function chunkRange(sessionId: string): IDBKeyRange {
  return IDBKeyRange.bound(`${sessionId}:`, `${sessionId}:\uffff`);
}

function clearHeartbeat(apiKey: string): void {
  try {
    localStorage.removeItem(heartbeatKey(apiKey));
  } catch {
    // Liveness then falls back to the heartbeat expiring on its own.
  }
}

// A page that is going away stops sending heartbeats. Clearing the heartbeat
// lets a reload of the same page recover the recording without waiting for it
// to expire.
function installPageHideListener(): void {
  if (pageHideListenerInstalled || typeof window === 'undefined') return;
  pageHideListenerInstalled = true;
  window.addEventListener('pagehide', () => {
    sessionApiKeys.forEach((apiKey, sessionId) => {
      if (getPendingSessionId(apiKey) === sessionId) clearHeartbeat(apiKey);
    });
  });
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
      localStorage.removeItem(heartbeatKey(apiKey));
    }
  } catch {
    // IndexedDB remains the source for cleanup if local storage is unavailable.
  }
}

function updateHeartbeat(apiKey: string): void {
  try {
    localStorage.setItem(heartbeatKey(apiKey), String(Date.now()));
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
    const value = Number(localStorage.getItem(heartbeatKey(apiKey)));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function isPendingSessionLive(apiKey: string): boolean {
  const heartbeat = getHeartbeat(apiKey);
  return heartbeat !== null && Date.now() - heartbeat < RECOVERY_LIVENESS_MS;
}

async function waitUntilPendingSessionIdle(apiKey: string): Promise<void> {
  let heartbeat = getHeartbeat(apiKey);
  while (heartbeat && Date.now() - heartbeat < RECOVERY_LIVENESS_MS) {
    const remaining = RECOVERY_LIVENESS_MS - Math.max(0, Date.now() - heartbeat);
    await new Promise((resolve) => setTimeout(resolve, remaining + 10));
    heartbeat = getHeartbeat(apiKey);
  }
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
  await database.delete(CHUNK_STORE, chunkRange(sessionId));
  await database.delete(SESSION_STORE, sessionId);
  writeQueues.delete(sessionId);
}

function isStartBlocked(apiKey: string): boolean {
  return getPendingSessionId(apiKey) !== null && isPendingSessionLive(apiKey);
}

// An abandoned pending session is replaced as the pending pointer, but its
// records stay in IndexedDB, where recover() still finds them.
async function begin(input: BeginRecordingInput): Promise<string | null> {
  if (isStartBlocked(input.apiKey)) return null;

  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  try {
    installPageHideListener();
    localStorage.setItem(pendingKey(input.apiKey), sessionId);
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

// Keeps the stored chunks for a later recovery, but stops treating the session
// as live so other recordings can start.
function release(sessionId: string): void {
  const apiKey = sessionApiKeys.get(sessionId);
  sessionApiKeys.delete(sessionId);
  heartbeatTimes.delete(sessionId);
  if (apiKey && getPendingSessionId(apiKey) === sessionId) clearHeartbeat(apiKey);
}

function isStorageUsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_USED_KEY) === 'true';
  } catch {
    return false;
  }
}

async function discardSession(
  database: IDBPDatabase<RecordingStoreDB>,
  apiKey: string,
  sessionId: string
): Promise<void> {
  closedSessions.add(sessionId);
  await deleteSessionRecords(database, sessionId);
  clearPendingSession(apiKey, sessionId);
}

async function recover(apiKey: string, ownerEmail?: string): Promise<RecoveredRecording | null> {
  const pendingSessionId = getPendingSessionId(apiKey);
  if (!pendingSessionId && !isStorageUsed()) return null;

  try {
    const database = await initDB();
    const candidates = (await database.getAll(SESSION_STORE))
      .filter((session) => session.apiKey === apiKey && !sessionApiKeys.has(session.id))
      .sort((left, right) => sessionStartedAt(left.id) - sessionStartedAt(right.id));
    if (pendingSessionId && !candidates.some((session) => session.id === pendingSessionId)) {
      if (!sessionApiKeys.has(pendingSessionId)) clearPendingSession(apiKey, pendingSessionId);
    }

    for (const candidate of candidates) {
      if (candidate.id === getPendingSessionId(apiKey)) {
        await waitUntilPendingSessionIdle(apiKey);
      }
      const session = await database.get(SESSION_STORE, candidate.id);
      if (!session) continue;
      if (session.ownerEmail !== normalizeOwnerEmail(ownerEmail)) {
        await discardSession(database, apiKey, session.id);
        continue;
      }

      const chunks = (await database.getAll(CHUNK_STORE, chunkRange(session.id))).sort(
        (left, right) => left.index - right.index
      );
      if (chunks.length === 0) {
        await discardSession(database, apiKey, session.id);
        continue;
      }

      return {
        sessionId: session.id,
        blob: new Blob(
          chunks.map((chunk) => chunk.blob),
          { type: session.mimeType }
        ),
        mimeType: session.mimeType,
        durationMs: Math.max(...chunks.map((chunk) => chunk.durationMs)),
        startedAt: session.startedAt,
        hasAudio: session.hasAudio,
      };
    }
    return null;
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
  release,
  remove,
  recover,
  expire,
};
