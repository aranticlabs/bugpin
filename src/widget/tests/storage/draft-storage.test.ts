import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { installFakeIndexedDB } from '../helpers/fake-indexeddb';
import { installDom } from '../helpers/dom';

describe('draft storage', () => {
  const TEST_API_KEY = 'test-api-key-123';
  let restoreDom: (() => void) | null = null;

  beforeEach(() => {
    restoreDom = installDom();
    installFakeIndexedDB();
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    restoreDom?.();
    restoreDom = null;
  });

  it('saves form data to localStorage', async () => {
    // Import after DOM is set up
    const { draftStorage } = await import('../../storage/draft-storage.js');

    const formData = {
      title: 'Test Bug',
      description: 'This is a test bug description',
      priority: 'high' as const,
      reporterEmail: 'test@example.com',
      reporterName: 'Test User',
    };

    await draftStorage.save(TEST_API_KEY, formData, 'details', []);

    // Check localStorage directly
    const key = `bugpin-draft-${TEST_API_KEY}`;
    const stored = localStorage.getItem(key);
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed.formData.title).toBe('Test Bug');
    expect(parsed.formData.description).toBe('This is a test bug description');
    expect(parsed.formData.priority).toBe('high');
    expect(parsed.formData.reporterEmail).toBe('test@example.com');
    expect(parsed.formData.reporterName).toBe('Test User');
    expect(parsed.activeTab).toBe('details');
    expect(parsed.savedAt).toBeDefined();
  });

  it('loads form data from localStorage', async () => {
    const { draftStorage } = await import('../../storage/draft-storage.js');

    // Manually set localStorage data
    const key = `bugpin-draft-${TEST_API_KEY}`;
    const draftData = {
      formData: {
        title: 'Stored Bug',
        description: 'Stored description',
        priority: 'low',
        reporterEmail: 'stored@example.com',
        reporterName: 'Stored User',
      },
      activeTab: 'media',
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(draftData));

    const loaded = await draftStorage.load(TEST_API_KEY);

    expect(loaded).not.toBeNull();
    expect(loaded?.formData.title).toBe('Stored Bug');
    expect(loaded?.formData.priority).toBe('low');
    expect(loaded?.activeTab).toBe('media');
  });

  it('clears form data from localStorage', async () => {
    const { draftStorage } = await import('../../storage/draft-storage.js');

    // Set up a draft
    const key = `bugpin-draft-${TEST_API_KEY}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        formData: { title: 'To Delete' },
        activeTab: 'details',
        savedAt: new Date().toISOString(),
      })
    );

    // Verify it exists
    expect(localStorage.getItem(key)).not.toBeNull();

    await draftStorage.clear(TEST_API_KEY);

    // Verify it's gone
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('keeps drafts separate per API key', async () => {
    const { draftStorage } = await import('../../storage/draft-storage.js');

    const formData1 = {
      title: 'Bug for Project 1',
      description: '',
      priority: 'low' as const,
      reporterEmail: '',
      reporterName: '',
    };

    const formData2 = {
      title: 'Bug for Project 2',
      description: '',
      priority: 'high' as const,
      reporterEmail: '',
      reporterName: '',
    };

    await draftStorage.save('api-key-1', formData1, 'details', []);
    await draftStorage.save('api-key-2', formData2, 'details', []);

    // Check they're stored separately
    const stored1 = JSON.parse(localStorage.getItem('bugpin-draft-api-key-1')!);
    const stored2 = JSON.parse(localStorage.getItem('bugpin-draft-api-key-2')!);

    expect(stored1.formData.title).toBe('Bug for Project 1');
    expect(stored1.formData.priority).toBe('low');
    expect(stored2.formData.title).toBe('Bug for Project 2');
    expect(stored2.formData.priority).toBe('high');
  });

  it('restores drafts owned by the same normalized reporter email', async () => {
    const { draftStorage } = await import('../../storage/draft-storage.js');
    const apiKey = `${TEST_API_KEY}-owner-match`;
    const formData = {
      title: 'Owned draft',
      description: '',
      priority: 'medium' as const,
      reporterEmail: 'edited@example.com',
      reporterName: 'Edited User',
    };
    const media = [
      {
        id: 'media-1',
        dataUrl: 'data:image/png;base64,abc',
        timestamp: new Date(),
        annotated: false,
        mimeType: 'image/png',
      },
    ];

    await draftStorage.save(apiKey, formData, 'media', media, ' Owner@Example.com ');

    const stored = JSON.parse(localStorage.getItem(`bugpin-draft-${apiKey}`)!);
    expect(stored.ownerEmail).toBe('owner@example.com');

    const loaded = await draftStorage.load(apiKey, 'owner@example.COM');
    expect(loaded?.formData.reporterEmail).toBe('edited@example.com');
    expect(loaded?.media).toHaveLength(1);
  });

  it('stores and restores Blob-backed media without conversion', async () => {
    const { draftStorage } = await import('../../storage/draft-storage.js');
    const apiKey = `${TEST_API_KEY}-blob`;
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' });

    await draftStorage.save(
      apiKey,
      {
        title: 'Video draft',
        description: '',
        priority: 'medium',
        reporterEmail: '',
        reporterName: '',
      },
      'media',
      [
        {
          id: 'video-1',
          blob,
          timestamp: new Date(),
          annotated: false,
          mimeType: 'video/mp4',
        },
      ]
    );

    const loaded = await draftStorage.load(apiKey);
    expect(loaded?.media[0]?.blob).toBeInstanceOf(Blob);
    expect(loaded?.media[0]?.blob?.size).toBe(3);
    expect(loaded?.media[0]?.dataUrl).toBeUndefined();
  });

  it('clears drafts and media owned by another or unknown reporter', async () => {
    const { draftStorage } = await import('../../storage/draft-storage.js');
    const formData = {
      title: 'Private draft',
      description: '',
      priority: 'medium' as const,
      reporterEmail: 'old@example.com',
      reporterName: 'Old User',
    };
    const media = [
      {
        id: 'media-1',
        dataUrl: 'data:image/png;base64,abc',
        timestamp: new Date(),
        annotated: false,
        mimeType: 'image/png',
      },
    ];

    for (const [suffix, ownerEmail] of [
      ['mismatch', 'old@example.com'],
      ['legacy', undefined],
    ] as const) {
      const apiKey = `${TEST_API_KEY}-${suffix}`;
      await draftStorage.save(apiKey, formData, 'media', media, ownerEmail);

      expect(await draftStorage.load(apiKey, 'new@example.com')).toBeNull();
      expect(localStorage.getItem(`bugpin-draft-${apiKey}`)).toBeNull();
      expect(await draftStorage.has(apiKey)).toBe(false);
    }
  });

  it('clears owned drafts when the current session has no reporter email', async () => {
    const { draftStorage } = await import('../../storage/draft-storage.js');
    const apiKey = `${TEST_API_KEY}-guest-after-owner`;
    const formData = {
      title: 'Private draft',
      description: '',
      priority: 'medium' as const,
      reporterEmail: 'old@example.com',
      reporterName: 'Old User',
    };
    const media = [
      {
        id: 'media-1',
        dataUrl: 'data:image/png;base64,abc',
        timestamp: new Date(),
        annotated: false,
        mimeType: 'image/png',
      },
    ];

    await draftStorage.save(apiKey, formData, 'media', media, 'old@example.com');

    expect(await draftStorage.load(apiKey)).toBeNull();
    expect(localStorage.getItem(`bugpin-draft-${apiKey}`)).toBeNull();
    expect(await draftStorage.has(apiKey)).toBe(false);
  });

  it('clears leftover IndexedDB media when the form draft is missing', async () => {
    const { draftStorage } = await import('../../storage/draft-storage.js');
    const apiKey = `${TEST_API_KEY}-orphaned-media`;
    const formData = {
      title: 'Private draft',
      description: '',
      priority: 'medium' as const,
      reporterEmail: 'old@example.com',
      reporterName: 'Old User',
    };
    const media = [
      {
        id: 'media-1',
        dataUrl: 'data:image/png;base64,abc',
        timestamp: new Date(),
        annotated: false,
        mimeType: 'image/png',
      },
    ];

    await draftStorage.save(apiKey, formData, 'media', media, 'old@example.com');
    localStorage.removeItem(`bugpin-draft-${apiKey}`);

    expect(await draftStorage.load(apiKey, 'new@example.com')).toBeNull();
    expect(await draftStorage.has(apiKey)).toBe(false);
    expect(await draftStorage.load(apiKey, 'old@example.com')).toBeNull();
  });

  it('restores unowned drafts for sessions without a reporter email', async () => {
    const { draftStorage } = await import('../../storage/draft-storage.js');
    const apiKey = `${TEST_API_KEY}-guest-legacy`;
    const formData = {
      title: 'Guest draft',
      description: '',
      priority: 'medium' as const,
      reporterEmail: '',
      reporterName: '',
    };

    await draftStorage.save(apiKey, formData, 'details', []);

    const loaded = await draftStorage.load(apiKey);
    expect(loaded?.formData.title).toBe('Guest draft');
  });

  it('expires all draft media after seven days while keeping form text', async () => {
    const { draftStorage } = await import('../../storage/draft-storage.js');
    const apiKey = `${TEST_API_KEY}-expired-media`;
    await draftStorage.save(
      apiKey,
      {
        title: 'Keep this text',
        description: 'The media expires separately',
        priority: 'medium',
        reporterEmail: '',
        reporterName: '',
      },
      'media',
      [
        {
          id: 'screenshot-1',
          dataUrl: 'data:image/png;base64,AA==',
          timestamp: new Date(),
          annotated: false,
          mimeType: 'image/png',
        },
        {
          id: 'recording-1',
          blob: new Blob([new Uint8Array([1])], { type: 'video/webm' }),
          timestamp: new Date(),
          annotated: false,
          mimeType: 'video/webm',
          source: 'recording',
        },
      ]
    );
    localStorage.setItem(
      `bugpin-draft-media-saved-at-${apiKey}`,
      new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    );

    expect(await draftStorage.expireMedia(apiKey)).toBe(true);
    const loaded = await draftStorage.load(apiKey);
    expect(loaded?.formData.title).toBe('Keep this text');
    expect(loaded?.media).toEqual([]);
  });

  it('keeps fresh draft media and records its local expiry timestamp', async () => {
    const { draftStorage } = await import('../../storage/draft-storage.js');
    const apiKey = `${TEST_API_KEY}-fresh-media`;
    await draftStorage.save(
      apiKey,
      {
        title: 'Fresh media',
        description: '',
        priority: 'medium',
        reporterEmail: '',
        reporterName: '',
      },
      'media',
      [
        {
          id: 'screenshot-1',
          dataUrl: 'data:image/png;base64,AA==',
          timestamp: new Date(),
          annotated: false,
          mimeType: 'image/png',
        },
      ]
    );

    expect(localStorage.getItem(`bugpin-draft-media-saved-at-${apiKey}`)).not.toBeNull();
    expect(await draftStorage.expireMedia(apiKey)).toBe(false);
    expect((await draftStorage.load(apiKey))?.media).toHaveLength(1);
  });

  it('does not open IndexedDB when no media expiry timestamp exists', async () => {
    const open = spyOn(globalThis.indexedDB, 'open');
    // @ts-expect-error - Query params isolate the module-level database handle.
    const { draftStorage } = await import('../../storage/draft-storage?no-media-timestamp');

    expect(await draftStorage.expireMedia(`${TEST_API_KEY}-no-media-timestamp`)).toBe(false);
    expect(open).toHaveBeenCalledTimes(0);
  });
});
