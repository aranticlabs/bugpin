import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { installDom } from '../helpers/dom';
import { installFakeIndexedDB } from '../helpers/fake-indexeddb';

const PENDING_KEY_PREFIX = 'bugpin-recording-pending-';
const HEARTBEAT_KEY_PREFIX = 'bugpin-recording-heartbeat-';
const TAB_ID_KEY = 'bugpin-recording-tab-id';
const STORAGE_USED_KEY = 'bugpin-recording-storage-used';
let restoreDom: (() => void) | null = null;

function openRecordingDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bugpin-recordings');
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains('sessions')) {
        request.result.createObjectStore('sessions', { keyPath: 'id' });
      }
      if (!request.result.objectStoreNames.contains('chunks')) {
        request.result.createObjectStore('chunks', { keyPath: 'id' });
      }
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

async function countRecords(storeName: string): Promise<number> {
  const database = await openRecordingDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName).objectStore(storeName).count();
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

async function putRecord(storeName: string, value: unknown): Promise<void> {
  const database = await openRecordingDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('error', () => reject(transaction.error));
    transaction.objectStore(storeName).put(value);
  });
}

beforeEach(() => {
  restoreDom = installDom();
  installFakeIndexedDB();
  localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  restoreDom?.();
  restoreDom = null;
});

describe('recording store', () => {
  it('does not open IndexedDB when there is no pending flag', async () => {
    const open = spyOn(globalThis.indexedDB, 'open');
    // @ts-expect-error - Query params isolate the module-level database handle.
    const { recordingStore } = await import('../../storage/recording-store?no-pending');
    expect(await recordingStore.recover('no-pending')).toBeNull();
    expect(open).toHaveBeenCalledTimes(0);
  });

  it('does not open IndexedDB for expiry when storage was never used', async () => {
    const open = spyOn(globalThis.indexedDB, 'open');
    // @ts-expect-error - Query params isolate the module-level database handle.
    const { recordingStore } = await import('../../storage/recording-store?unused-expiry');
    expect(await recordingStore.expire()).toBe(false);
    expect(open).toHaveBeenCalledTimes(0);
  });

  it('keeps the pending flag when recovery storage cannot be read', async () => {
    const apiKey = 'recording-recovery-failure';
    const pendingKey = `${PENDING_KEY_PREFIX}${apiKey}`;
    localStorage.setItem(pendingKey, '1-session');
    const availableIndexedDB = globalThis.indexedDB;
    globalThis.indexedDB = undefined as unknown as IDBFactory;
    try {
      // @ts-expect-error - Query params isolate the module-level database handle.
      const { recordingStore } = await import('../../storage/recording-store?recovery-failure');
      expect(await recordingStore.recover(apiKey)).toBeNull();
      expect(localStorage.getItem(pendingKey)).toBe('1-session');
    } finally {
      globalThis.indexedDB = availableIndexedDB;
    }
  });

  it('stores chunks and rebuilds them in index order', async () => {
    // @ts-expect-error - Query params isolate the module-level database handle.
    const { recordingStore } = await import('../../storage/recording-store?ordered-chunks');
    const apiKey = 'recording-recovery';
    const sessionId = await recordingStore.begin({
      apiKey,
      ownerEmail: ' Owner@Example.com ',
      mimeType: 'video/webm;codecs=vp9',
      hasAudio: true,
    });
    expect(sessionId).not.toBeNull();

    await recordingStore.addChunk(sessionId as string, 1, new Blob([new Uint8Array([3, 4])]), 2000);
    await recordingStore.addChunk(sessionId as string, 0, new Blob([new Uint8Array([1, 2])]), 1000);
    localStorage.setItem(`${HEARTBEAT_KEY_PREFIX}${apiKey}`, '1');

    const recovered = await recordingStore.recover(apiKey, 'owner@example.COM');
    expect(recovered).toMatchObject({
      sessionId,
      mimeType: 'video/webm',
      durationMs: 2000,
      hasAudio: true,
    });
    expect([...new Uint8Array(await recovered!.blob.arrayBuffer())]).toEqual([1, 2, 3, 4]);
  });

  it('deletes a pending recording owned by another reporter', async () => {
    // @ts-expect-error - Query params isolate the module-level database handle.
    const { recordingStore } = await import('../../storage/recording-store?owner-mismatch');
    const apiKey = 'recording-owner-mismatch';
    const sessionId = await recordingStore.begin({
      apiKey,
      ownerEmail: 'old@example.com',
      mimeType: 'video/mp4',
      hasAudio: false,
    });
    await recordingStore.addChunk(sessionId as string, 0, new Blob([new Uint8Array([1])]), 1000);
    localStorage.setItem(`${HEARTBEAT_KEY_PREFIX}${apiKey}`, '1');

    expect(await recordingStore.recover(apiKey, 'new@example.com')).toBeNull();
    expect(localStorage.getItem(`${PENDING_KEY_PREFIX}${apiKey}`)).toBeNull();
    expect(await recordingStore.recover(apiKey, 'old@example.com')).toBeNull();
  });

  it('clears completed sessions and blocks a second recent recording', async () => {
    // @ts-expect-error - Query params isolate the module-level database handle.
    const { recordingStore } = await import('../../storage/recording-store?cleanup');
    const apiKey = 'recording-cleanup';
    const sessionId = await recordingStore.begin({
      apiKey,
      mimeType: 'video/webm',
      hasAudio: false,
    });
    expect(recordingStore.isStartBlocked(apiKey)).toBe(true);
    expect(
      await recordingStore.begin({ apiKey, mimeType: 'video/webm', hasAudio: false })
    ).toBeNull();

    await recordingStore.remove(apiKey, sessionId as string);
    expect(recordingStore.isStartBlocked(apiKey)).toBe(false);
    expect(await recordingStore.recover(apiKey)).toBeNull();
  });

  it('keeps a stale pending session available for recovery', async () => {
    // @ts-expect-error - Query params isolate the module-level database handle.
    const { recordingStore } = await import('../../storage/recording-store?stale');
    const apiKey = 'recording-stale';
    localStorage.setItem(`${PENDING_KEY_PREFIX}${apiKey}`, '1-stale');

    expect(recordingStore.isStartBlocked(apiKey)).toBe(false);
    const sessionId = await recordingStore.begin({
      apiKey,
      mimeType: 'video/webm',
      hasAudio: false,
    });
    expect(sessionId).toBeNull();
    expect(localStorage.getItem(`${PENDING_KEY_PREFIX}${apiKey}`)).toBe('1-stale');
  });

  it('waits for another tab heartbeat to expire and then recovers', async () => {
    // @ts-expect-error - Query params isolate the module-level database handle.
    const { recordingStore } = await import('../../storage/recording-store?active-owner');
    const apiKey = 'recording-active-tab';
    const sessionId = await recordingStore.begin({
      apiKey,
      mimeType: 'video/webm',
      hasAudio: false,
    });
    await recordingStore.addChunk(sessionId as string, 0, new Blob(['video']), 1000);
    window.sessionStorage.setItem(TAB_ID_KEY, 'second-tab');
    const availableSetTimeout = globalThis.setTimeout;
    const availableDateNow = Date.now;
    let now = Date.now();
    Date.now = () => now;
    globalThis.setTimeout = ((handler: TimerHandler) => {
      now += 90 * 1000 + 20;
      if (typeof handler === 'function') handler();
      return 1;
    }) as typeof setTimeout;
    try {
      // @ts-expect-error - Query params simulate a separate tab module instance.
      const secondTabModule = await import('../../storage/recording-store?second-tab');
      const secondTabStore = secondTabModule.recordingStore;
      expect((await secondTabStore.recover(apiKey))?.sessionId).toBe(sessionId);
    } finally {
      globalThis.setTimeout = availableSetTimeout;
      Date.now = availableDateNow;
    }
  });

  it('does not accept chunk writes after cleanup starts', async () => {
    // @ts-expect-error - Query params isolate the module-level database handle.
    const { recordingStore } = await import('../../storage/recording-store?cleanup-race');
    const apiKey = 'recording-cleanup-race';
    const sessionId = await recordingStore.begin({
      apiKey,
      mimeType: 'video/webm',
      hasAudio: false,
    });
    const firstWrite = recordingStore.addChunk(sessionId as string, 0, new Blob(['first']), 1000);
    const removal = recordingStore.remove(apiKey, sessionId as string);
    await recordingStore.addChunk(sessionId as string, 1, new Blob(['late']), 2000);
    await Promise.all([firstWrite, removal]);

    expect(await countRecords('sessions')).toBe(0);
    expect(await countRecords('chunks')).toBe(0);
  });

  it('expires abandoned recording sessions and chunks after seven days', async () => {
    const oldSessionId = `${Date.now() - 8 * 24 * 60 * 60 * 1000}-expired`;
    await putRecord('sessions', {
      id: oldSessionId,
      apiKey: 'recording-expiry',
      mimeType: 'video/webm',
      startedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      hasAudio: false,
    });
    await putRecord('chunks', {
      id: `${oldSessionId}:0`,
      sessionId: oldSessionId,
      index: 0,
      blob: new Blob(['expired']),
      durationMs: 1000,
    });
    localStorage.setItem(STORAGE_USED_KEY, 'true');

    // @ts-expect-error - Query params isolate the module-level database handle.
    const { recordingStore } = await import('../../storage/recording-store?expiry');
    expect(await recordingStore.expire()).toBe(true);
    expect(await countRecords('sessions')).toBe(0);
    expect(await countRecords('chunks')).toBe(0);
    expect(localStorage.getItem(STORAGE_USED_KEY)).toBeNull();
  });
});
