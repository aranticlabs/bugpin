import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { installDom } from '../helpers/dom';
import { installFakeIndexedDB } from '../helpers/fake-indexeddb';

const PENDING_KEY_PREFIX = 'bugpin-recording-pending-';
const HEARTBEAT_KEY_PREFIX = 'bugpin-recording-heartbeat-';
let restoreDom: (() => void) | null = null;

beforeEach(() => {
  restoreDom = installDom();
  installFakeIndexedDB();
  localStorage.clear();
});

afterEach(() => {
  restoreDom?.();
  restoreDom = null;
});

describe('recording store', () => {
  it('does not open IndexedDB when there is no pending flag', async () => {
    const availableIndexedDB = globalThis.indexedDB;
    globalThis.indexedDB = undefined as unknown as IDBFactory;
    try {
      const { recordingStore } = await import('../../storage/recording-store');
      expect(await recordingStore.recover('no-pending')).toBeNull();
    } finally {
      globalThis.indexedDB = availableIndexedDB;
    }
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
    const { recordingStore } = await import('../../storage/recording-store');
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
    const { recordingStore } = await import('../../storage/recording-store');
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
    const { recordingStore } = await import('../../storage/recording-store');
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

  it('replaces a stale session lock', async () => {
    const { recordingStore } = await import('../../storage/recording-store');
    const apiKey = 'recording-stale';
    localStorage.setItem(`${PENDING_KEY_PREFIX}${apiKey}`, '1-stale');

    expect(recordingStore.isStartBlocked(apiKey)).toBe(false);
    const sessionId = await recordingStore.begin({
      apiKey,
      mimeType: 'video/webm',
      hasAudio: false,
    });
    expect(sessionId).not.toBeNull();
    expect(localStorage.getItem(`${PENDING_KEY_PREFIX}${apiKey}`)).toBe(sessionId);
  });
});
