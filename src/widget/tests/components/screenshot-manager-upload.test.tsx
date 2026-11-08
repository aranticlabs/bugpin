import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { render } from 'preact';
import {
  downloadMedia,
  formatMediaMeta,
  ScreenshotManager,
  type CapturedMedia,
} from '../../components/ScreenshotManager';
import { ScreenRecordingPanel } from '../../components/ScreenRecordingPanel';
import { installDom } from '../helpers/dom';
import { setLocale, t } from '../../i18n/index';

const originalFileReader = globalThis.FileReader;
const originalImage = globalThis.Image;
const originalCreateObjectURL = globalThis.URL.createObjectURL;
const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;

let restoreDom: (() => void) | null = null;
let originalCreateElement: typeof document.createElement;
let createdObjectUrls: Blob[] = [];
let revokedObjectUrls: string[] = [];

class MockFileReader {
  result: string | ArrayBuffer | null = null;
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;

  readAsDataURL(_file: Blob) {
    this.result = 'data:image/png;base64,media';
    const trigger = () => this.onload?.(new window.Event('load') as ProgressEvent<FileReader>);
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(trigger);
    } else {
      setTimeout(trigger, 0);
    }
  }
}

class MockImage {
  width = 320;
  height = 240;
  onload: (() => void) | null = null;

  set src(_value: string) {
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(() => this.onload?.());
    } else {
      setTimeout(() => this.onload?.(), 0);
    }
  }
}

function buildFileList(file: File): FileList {
  return {
    0: file,
    length: 1,
    item: (index: number) => (index === 0 ? file : null),
  } as unknown as FileList;
}

function dropFile(target: Element, file: File): void {
  const event = new window.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files: buildFileList(file) } });
  target.dispatchEvent(event);
}

function renderVideoPanel(
  container: HTMLElement,
  clips: CapturedMedia[] = [],
  onUpload: (item: CapturedMedia) => void = () => undefined,
  onRemove: (id: string) => void = () => undefined
): void {
  render(
    <ScreenRecordingPanel
      clips={clips}
      recordingEnabled={false}
      onRecord={() => undefined}
      onUpload={onUpload}
      onRemove={onRemove}
      isStarting={false}
      allowMicrophone={false}
      includeMicrophone={false}
      onIncludeMicrophoneChange={() => undefined}
      oversizedRecording={null}
      onDismissOversizedRecording={() => undefined}
    />,
    container
  );
}

beforeEach(() => {
  restoreDom = installDom();
  createdObjectUrls = [];
  revokedObjectUrls = [];
  globalThis.FileReader = MockFileReader as unknown as typeof FileReader;
  globalThis.Image = MockImage as unknown as typeof Image;
  globalThis.URL.createObjectURL = ((blob: Blob) => {
    createdObjectUrls.push(blob);
    return `blob:test-${createdObjectUrls.length}`;
  }) as typeof URL.createObjectURL;
  globalThis.URL.revokeObjectURL = ((url: string) => {
    revokedObjectUrls.push(url);
  }) as typeof URL.revokeObjectURL;
  originalCreateElement = document.createElement.bind(document);
  document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
    const element = originalCreateElement(tagName, options);
    if (tagName.toLowerCase() === 'video') {
      const video = element as HTMLVideoElement;
      Object.defineProperties(video, {
        videoWidth: { value: 1280 },
        videoHeight: { value: 720 },
        duration: { value: 2.5 },
        src: {
          set: () =>
            queueMicrotask(() => video.onloadedmetadata?.(new window.Event('loadedmetadata'))),
        },
      });
    }
    return element;
  }) as typeof document.createElement;
});

afterEach(() => {
  setLocale('en');
  restoreDom?.();
  restoreDom = null;
  globalThis.FileReader = originalFileReader;
  globalThis.Image = originalImage;
  globalThis.URL.createObjectURL = originalCreateObjectURL;
  globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
});

describe('ScreenshotManager uploads', () => {
  it('formats video size for the active locale', () => {
    setLocale('fr');
    const meta = formatMediaMeta({
      id: 'video',
      blob: new Blob([new Uint8Array(1024 * 1024)]),
      timestamp: new Date(),
      annotated: false,
      mimeType: 'video/mp4',
    });

    expect(meta).toContain('Mo');
    expect(meta).not.toContain('MB');
  });

  it('downloads videos with their direct extension and source-specific name', () => {
    const downloads: string[] = [];
    const originalClick = window.HTMLAnchorElement.prototype.click;
    const originalSetTimeout = globalThis.setTimeout;
    window.HTMLAnchorElement.prototype.click = function () {
      downloads.push(this.download);
    };
    globalThis.setTimeout = (() => 1) as unknown as typeof setTimeout;

    try {
      const timestamp = new Date('2026-11-02T10:00:00Z');
      for (const [mimeType, source] of [
        ['video/mp4', undefined],
        ['video/webm', 'recording'],
        ['video/quicktime', undefined],
      ] as const) {
        downloadMedia({
          id: mimeType,
          blob: new Blob(['video'], { type: mimeType }),
          timestamp,
          annotated: false,
          mimeType,
          source,
        });
      }
    } finally {
      window.HTMLAnchorElement.prototype.click = originalClick;
      globalThis.setTimeout = originalSetTimeout;
    }

    expect(downloads.map((name) => name.replace(/-2026.*\./, '.'))).toEqual([
      'bugpin-video.mp4',
      'bugpin-recording.webm',
      'bugpin-video.mov',
    ]);
  });

  for (const populated of [false, true]) {
    it(`opens each panel's file picker from the ${populated ? 'add-more' : 'empty'} upload button`, () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const image: CapturedMedia = {
        id: 'image',
        dataUrl: 'data:image/png;base64,media',
        mimeType: 'image/png',
        timestamp: new Date(),
        annotated: false,
      };
      render(
        <ScreenshotManager
          media={populated ? [image] : []}
          onCapture={() => undefined}
          onUpload={() => undefined}
          onRemove={() => undefined}
          onAnnotate={() => undefined}
          isCapturing={false}
          enableAnnotation
          reduceQuality={false}
          onReduceQualityChange={() => undefined}
          oversizedCapture={null}
          onDismissOversizedCapture={() => undefined}
        />,
        container
      );
      for (const panel of ['screenshots', 'recordings']) {
        if (panel === 'recordings') {
          renderVideoPanel(
            container,
            populated
              ? [
                  {
                    ...image,
                    id: 'video',
                    mimeType: 'video/mp4',
                  },
                ]
              : []
          );
        }
        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        input.click = mock(() => undefined);
        const label = t(populated ? 'screenshot.addMore' : 'screenshot.dropzone.title');
        const trigger = [...container.querySelectorAll('button')].find((button) =>
          button.textContent?.includes(label)
        );
        expect(trigger).toBeDefined();
        trigger?.click();
        expect(input.click).toHaveBeenCalledTimes(1);
      }
      render(null, container);
      container.remove();
    });
  }

  it('advertises only supported image types', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    render(
      <ScreenshotManager
        media={[]}
        onCapture={() => undefined}
        onUpload={() => undefined}
        onRemove={() => undefined}
        onAnnotate={() => undefined}
        isCapturing={false}
        enableAnnotation={true}
        reduceQuality={false}
        onReduceQualityChange={() => undefined}
        oversizedCapture={null}
        onDismissOversizedCapture={() => undefined}
      />,
      container
    );

    const input = container.querySelector('input[type="file"]');
    expect(input?.getAttribute('accept')).toBe('image/png,image/jpeg,image/gif,image/webp');

    render(null, container);
    container.remove();
  });

  it('shows error for unsupported file types', async () => {
    const onUpload = mock(() => undefined);
    const container = document.createElement('div');
    document.body.appendChild(container);

    render(
      <ScreenshotManager
        media={[]}
        onCapture={() => undefined}
        onUpload={onUpload}
        onRemove={() => undefined}
        onAnnotate={() => undefined}
        isCapturing={false}
        enableAnnotation={true}
        reduceQuality={false}
        onReduceQualityChange={() => undefined}
        oversizedCapture={null}
        onDismissOversizedCapture={() => undefined}
      />,
      container
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    const file = new File([new Uint8Array([1])], 'doc.pdf', { type: 'application/pdf' });
    if (input) {
      Object.defineProperty(input, 'files', { value: buildFileList(file), configurable: true });
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
    }

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container.textContent).toContain('Unsupported file type');
    expect(onUpload).not.toHaveBeenCalled();

    render(null, container);
    container.remove();
  });

  it('accepts MOV and rejects AVI during file selection', async () => {
    const onUpload = mock(() => undefined);
    const container = document.createElement('div');
    document.body.appendChild(container);

    renderVideoPanel(container, [], onUpload);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: buildFileList(
        new File([new Uint8Array([1])], 'clip.mov', { type: 'video/quicktime' })
      ),
      configurable: true,
    });
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container.textContent).not.toContain('Unsupported video format');
    expect(onUpload).toHaveBeenCalledTimes(1);
    const uploaded = (onUpload.mock.calls as unknown[][])[0]?.[0] as
      | { blob?: Blob; dataUrl?: string; width?: number; height?: number; durationMs?: number }
      | undefined;
    expect(uploaded?.blob).toBeInstanceOf(Blob);
    expect(uploaded?.dataUrl).toBeUndefined();
    expect(uploaded?.width).toBe(1280);
    expect(uploaded?.height).toBe(720);
    expect(uploaded?.durationMs).toBe(2500);
    expect(createdObjectUrls).toHaveLength(1);
    expect(revokedObjectUrls).toContain('blob:test-1');

    Object.defineProperty(input, 'files', {
      value: buildFileList(
        new File([new Uint8Array([1])], 'clip.avi', { type: 'video/x-msvideo' })
      ),
      configurable: true,
    });
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container.textContent).toContain('Unsupported video format');
    expect(onUpload).toHaveBeenCalledTimes(1);

    render(null, container);
    container.remove();
  });

  it('uploads a valid image and records dimensions', async () => {
    const onUpload = mock(() => undefined);
    const container = document.createElement('div');
    document.body.appendChild(container);

    render(
      <ScreenshotManager
        media={[]}
        onCapture={() => undefined}
        onUpload={onUpload}
        onRemove={() => undefined}
        onAnnotate={() => undefined}
        isCapturing={false}
        enableAnnotation={true}
        reduceQuality={false}
        onReduceQualityChange={() => undefined}
        oversizedCapture={null}
        onDismissOversizedCapture={() => undefined}
      />,
      container
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    const file = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' });
    if (input) {
      Object.defineProperty(input, 'files', { value: buildFileList(file), configurable: true });
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onUpload).toHaveBeenCalledTimes(1);
    const uploaded = (onUpload.mock.calls as unknown[][])[0]?.[0] as
      { width?: number; height?: number } | undefined;
    expect(uploaded?.width).toBe(320);
    expect(uploaded?.height).toBe(240);

    render(null, container);
    container.remove();
  });

  it('accepts files from the matching image and video drop zones', async () => {
    const imageUpload = mock(() => undefined);
    const videoUpload = mock(() => undefined);
    const container = document.createElement('div');
    document.body.appendChild(container);

    render(
      <ScreenshotManager
        media={[]}
        onCapture={() => undefined}
        onUpload={imageUpload}
        onRemove={() => undefined}
        onAnnotate={() => undefined}
        isCapturing={false}
        enableAnnotation={true}
        reduceQuality={false}
        onReduceQualityChange={() => undefined}
        oversizedCapture={null}
        onDismissOversizedCapture={() => undefined}
      />,
      container
    );
    const imageDropZone = container.querySelector('.border-dashed');
    if (!imageDropZone) throw new Error('Image drop zone missing');
    dropFile(imageDropZone, new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    renderVideoPanel(container, [], videoUpload);
    const videoDropZone = container.querySelector('.border-dashed');
    if (!videoDropZone) throw new Error('Video drop zone missing');
    dropFile(videoDropZone, new File([new Uint8Array([1])], 'clip.mp4', { type: 'video/mp4' }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(imageUpload).toHaveBeenCalledTimes(1);
    expect(videoUpload).toHaveBeenCalledTimes(1);

    render(null, container);
    container.remove();
  });

  it('keeps the Blob when uploaded video metadata cannot be read', async () => {
    const onUpload = mock(() => undefined);
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderVideoPanel(container, [], onUpload);
    document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === 'video') {
        const video = element as HTMLVideoElement;
        Object.defineProperty(video, 'src', {
          set: () =>
            queueMicrotask(() => {
              video.onerror?.(new window.Event('error'));
              video.onerror?.(new window.Event('error'));
            }),
        });
      }
      return element;
    }) as typeof document.createElement;

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: buildFileList(new File([new Uint8Array([1])], 'broken.mp4', { type: 'video/mp4' })),
      configurable: true,
    });
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container.textContent).not.toContain('Unsupported video format');
    expect(onUpload).toHaveBeenCalledTimes(1);
    const uploaded = (onUpload.mock.calls as unknown[][])[0]?.[0] as
      { blob?: Blob; width?: number; height?: number; durationMs?: number } | undefined;
    expect(uploaded?.blob).toBeInstanceOf(Blob);
    expect(uploaded?.width).toBeUndefined();
    expect(uploaded?.height).toBeUndefined();
    expect(uploaded?.durationMs).toBeUndefined();
    expect(revokedObjectUrls).toContain('blob:test-1');

    render(null, container);
    container.remove();
  });

  it('previews Blob-backed videos and falls back without losing actions', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' });
    const onRemove = mock(() => undefined);
    const renderVideo = (videoBlob: Blob) =>
      renderVideoPanel(
        container,
        [
          {
            id: 'video-1',
            blob: videoBlob,
            timestamp: new Date(),
            annotated: false,
            mimeType: 'video/mp4',
          },
        ],
        () => undefined,
        onRemove
      );

    renderVideo(blob);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const video = container.querySelector('video');
    expect(video?.getAttribute('src')).toBe('blob:test-1');
    expect(video?.controls).toBe(true);
    expect(video?.muted).toBe(false);
    expect(createdObjectUrls).toEqual([blob]);

    video?.dispatchEvent(new window.Event('error'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const fallback = container.querySelector('[data-testid="video-preview-fallback"]');
    expect(fallback?.textContent).toContain(t('recording.previewUnavailable'));
    expect(container.textContent).toContain('0.1 MB');
    const remove = container.querySelector(
      `button[title="${t('screenshot.action.remove')}"]`
    ) as HTMLButtonElement;
    remove.click();
    expect(onRemove).toHaveBeenCalledWith('video-1');

    const replacement = new Blob([new Uint8Array([4, 5, 6])], { type: 'video/mp4' });
    renderVideo(replacement);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector('[data-testid="video-preview-fallback"]')).toBeNull();
    expect(container.querySelector('video')?.getAttribute('src')).toBe('blob:test-2');
    expect(revokedObjectUrls).toContain('blob:test-1');

    render(null, container);
    expect(revokedObjectUrls).toContain('blob:test-2');
    container.remove();
  });
});
