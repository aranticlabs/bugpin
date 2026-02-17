import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { render } from 'preact';
import { ScreenshotManager } from '../../components/ScreenshotManager';
import { installDom } from '../helpers/dom';

const originalFileReader = globalThis.FileReader;
const originalImage = globalThis.Image;

let restoreDom: (() => void) | null = null;

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

beforeEach(() => {
  restoreDom = installDom();
  globalThis.FileReader = MockFileReader as unknown as typeof FileReader;
  globalThis.Image = MockImage as unknown as typeof Image;
});

afterEach(() => {
  restoreDom?.();
  restoreDom = null;
  globalThis.FileReader = originalFileReader;
  globalThis.Image = originalImage;
});

describe('ScreenshotManager uploads', () => {
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
      />,
      container,
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
      />,
      container,
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
      | { width?: number; height?: number }
      | undefined;
    expect(uploaded?.width).toBe(320);
    expect(uploaded?.height).toBe(240);

    render(null, container);
    container.remove();
  });
});
