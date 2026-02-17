import { describe, it, expect, afterEach } from 'vitest';
import { createImage, getCroppedImg } from '../../../pages/globalsettings/imageUtils';

class TestImage {
  private listeners: Record<string, Array<(event?: unknown) => void>> = {};
  onload: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  width = 200;
  height = 200;

  addEventListener(type: string, listener: (event?: unknown) => void) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (event?: unknown) => void) {
    this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== listener);
  }

  set src(_value: string) {
    queueMicrotask(() => {
      (this.listeners.load || []).forEach((listener) => listener());
      this.onload?.();
    });
  }
}

describe('imageUtils', () => {
  const originalImage = global.Image;
  const originalCreateElement = document.createElement;

  afterEach(() => {
    global.Image = originalImage;
    document.createElement = originalCreateElement;
  });

  it('resolves createImage with an HTMLImageElement', async () => {
    global.Image = TestImage as unknown as typeof Image;

    const image = await createImage('data:image/png;base64,test');
    expect(image).toBeInstanceOf(TestImage);
  });

  it('throws when canvas context is unavailable', async () => {
    global.Image = TestImage as unknown as typeof Image;

    document.createElement = ((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          getContext: () => null,
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName);
    }) as typeof document.createElement;

    await expect(
      getCroppedImg('data:image/png;base64,test', { x: 0, y: 0, width: 50, height: 50 }),
    ).rejects.toThrow('No 2d context');
  });

  it('returns a blob for a cropped image', async () => {
    global.Image = TestImage as unknown as typeof Image;

    document.createElement = ((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: () => undefined,
          }),
          toBlob: (callback: (blob: Blob | null) => void) => {
            callback(new Blob(['data'], { type: 'image/jpeg' }));
          },
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName);
    }) as typeof document.createElement;

    const result = await getCroppedImg('data:image/png;base64,test', {
      x: 0,
      y: 0,
      width: 50,
      height: 50,
    });
    expect(result).toBeInstanceOf(Blob);
  });
});
