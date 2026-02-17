import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { config } from '../../../src/server/config';

let metadataWidth = 512;
let metadataHeight = 512;

const sharpMock = (input: Buffer) => {
  return {
    resize: () => sharpMock(input),
    png: () => sharpMock(input),
    toBuffer: async () => Buffer.from('processed'),
    metadata: async () => ({ width: metadataWidth, height: metadataHeight }),
  };
};

mock.module('sharp', () => ({
  default: sharpMock,
}));

let tempDir = '';
const originalConfig = { ...config };

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-branding-'));
  Object.assign(config, {
    dataDir: tempDir,
    dbPath: path.join(tempDir, 'bugpin.db'),
    uploadsDir: path.join(tempDir, 'uploads'),
    screenshotsDir: path.join(tempDir, 'uploads', 'screenshots'),
    attachmentsDir: path.join(tempDir, 'uploads', 'attachments'),
    brandingDir: path.join(tempDir, 'uploads', 'branding'),
    avatarsDir: path.join(tempDir, 'uploads', 'avatars'),
  });
});

afterAll(() => {
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  Object.assign(config, originalConfig);
});

beforeEach(() => {
  metadataWidth = 512;
  metadataHeight = 512;
});

describe('branding storage', () => {
  it('saves branding logo and icon', async () => {
    const { saveBrandingLogo } = await import('../../../src/server/storage/files');

    const icon = await saveBrandingLogo({
      mode: 'light',
      filename: 'icon.png',
      mimeType: 'image/png',
      data: Buffer.from('icon'),
      type: 'icon',
    });

    const logo = await saveBrandingLogo({
      mode: 'light',
      filename: 'logo.svg',
      mimeType: 'image/svg+xml',
      data: Buffer.from('logo'),
      type: 'logo',
    });

    expect(icon.filename).toBe('icon-light.png');
    expect(fs.existsSync(icon.path)).toBe(true);
    expect(logo.filename).toBe('logo-light.svg');
    expect(fs.existsSync(logo.path)).toBe(true);
  });

  it('generates favicon set when image is large enough', async () => {
    const { saveBrandingFavicon } = await import('../../../src/server/storage/files');

    const faviconSet = await saveBrandingFavicon('dark', Buffer.from('favicon'));

    expect(fs.existsSync(faviconSet.appleTouchIcon)).toBe(true);
    expect(fs.existsSync(faviconSet.androidChrome192)).toBe(true);
    expect(fs.existsSync(faviconSet.androidChrome512)).toBe(true);
    expect(fs.existsSync(faviconSet.ico)).toBe(true);
    expect(faviconSet.version).toBeTruthy();
  });

  it('rejects favicon sources smaller than 512x512', async () => {
    metadataWidth = 256;
    metadataHeight = 256;
    const { saveBrandingFavicon } = await import('../../../src/server/storage/files');

    await expect(saveBrandingFavicon('light', Buffer.from('favicon'))).rejects.toThrow(
      'Favicon source must be at least 512x512px',
    );
  });

  it('deletes branding assets by type', async () => {
    const { deleteBrandingAsset } = await import('../../../src/server/storage/files');
    const modeDir = path.join(config.brandingDir, 'light');
    fs.mkdirSync(modeDir, { recursive: true });

    const logoPath = path.join(modeDir, 'logo-light.png');
    const iconPath = path.join(modeDir, 'icon-light.png');
    const faviconPath = path.join(modeDir, 'favicon-light.ico');

    fs.writeFileSync(logoPath, 'logo');
    fs.writeFileSync(iconPath, 'icon');
    fs.writeFileSync(faviconPath, 'ico');

    expect(deleteBrandingAsset('light', 'logo')).toBe(true);
    expect(deleteBrandingAsset('light', 'icon')).toBe(true);
    expect(deleteBrandingAsset('light', 'favicon')).toBe(true);

    expect(fs.existsSync(logoPath)).toBe(false);
    expect(fs.existsSync(iconPath)).toBe(false);
    expect(fs.existsSync(faviconPath)).toBe(false);
  });
});
