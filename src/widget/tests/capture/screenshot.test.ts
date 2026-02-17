import { describe, it, expect } from 'bun:test';
import { dataUrlToBlob, getExtensionFromDataUrl } from '../../capture/screenshot';

describe('screenshot helpers', () => {
  it('converts data URL to Blob with mime type', async () => {
    const data = 'data:text/plain;base64,SGVsbG8=';
    const blob = dataUrlToBlob(data);
    expect(blob.type).toContain('text/plain');
    const text = await blob.text();
    expect(text).toBe('Hello');
  });

  it('detects extension from data URL', () => {
    expect(getExtensionFromDataUrl('data:image/webp;base64,AA==')).toBe('webp');
    expect(getExtensionFromDataUrl('data:image/jpeg;base64,AA==')).toBe('jpg');
    expect(getExtensionFromDataUrl('data:image/gif;base64,AA==')).toBe('gif');
    expect(getExtensionFromDataUrl('data:image/png;base64,AA==')).toBe('png');
  });
});
