import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { filesRepo } from '../../src/server/database/repositories/files.repo';
import { config } from '../../src/server/config';
import {
  saveFile,
  readFile,
  deleteFile,
  deleteReportFiles,
  getFileStats,
  fileExists,
  saveAvatar,
  deleteAvatar,
  deleteAllAvatars,
  validateFile,
  validateFileContent,
} from '../../src/server/storage/files';

const originalFindFiles = filesRepo.findByReportId;
const originalConfig = { ...config };
let tempDir = '';

const pngBuffer = Buffer.from(
  '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C6360000000020001E221BC330000000049454E44AE426082',
  'hex'
);
const jpegBuffer = Buffer.from([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03, 0x03, 0x01, 0x11, 0x00, 0x02,
  0x11, 0x00, 0x03, 0x11, 0x00,
]);

function createWebpBufferVp8(width: number, height: number) {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'ascii');
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8 ', 12, 'ascii');
  buffer.writeUInt16LE(width, 26);
  buffer.writeUInt16LE(height, 28);
  return buffer;
}

function createWebpBufferVp8l(width: number, height: number) {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'ascii');
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8L', 12, 'ascii');
  const bits = (width - 1) | ((height - 1) << 14);
  buffer.writeUInt32LE(bits, 21);
  return buffer;
}

beforeAll(() => {
  filesRepo.findByReportId = async () => [];
  tempDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-files-'));
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
  filesRepo.findByReportId = originalFindFiles;
  Object.assign(config, originalConfig);
});

describe('file storage', () => {
  it('saves and reads files', async () => {
    const saved = await saveFile({
      reportId: 'rpt_1',
      type: 'screenshot',
      filename: 'shot.png',
      mimeType: 'image/png',
      data: pngBuffer,
    });

    expect(fileExists(saved.path)).toBe(true);
    expect(saved.width).toBe(1);
    expect(saved.height).toBe(1);

    const data = readFile(saved.path);
    expect(data?.length).toBe(pngBuffer.length);

    const stats = getFileStats(saved.path);
    expect(stats?.size).toBe(pngBuffer.length);

    const deleted = await deleteFile(saved.path);
    expect(deleted).toBe(true);
    expect(fileExists(saved.path)).toBe(false);
  });

  it('handles missing files gracefully', async () => {
    expect(readFile(path.join(tempDir, 'missing.png'))).toBeNull();
    expect(await deleteFile(path.join(tempDir, 'missing.png'))).toBe(true);
    expect(getFileStats(path.join(tempDir, 'missing.png'))).toBeNull();
  });

  it('stores videos alongside screenshots', async () => {
    const saved = await saveFile({
      reportId: 'rpt_video',
      type: 'video',
      filename: 'clip.mp4',
      mimeType: 'video/mp4',
      data: Buffer.from([0x00, 0x01]),
    });

    expect(saved.path.startsWith(config.screenshotsDir)).toBe(true);
  });

  it('stores attachments with fallback extension', async () => {
    const saved = await saveFile({
      reportId: 'rpt_attach',
      type: 'attachment',
      filename: 'data.bin',
      mimeType: 'application/x-custom',
      data: Buffer.from([0x00, 0x01]),
    });

    expect(saved.path.startsWith(config.attachmentsDir)).toBe(true);
    expect(saved.filename.endsWith('.bin')).toBe(true);
  });

  it('deletes report files across directories', async () => {
    const reportId = 'rpt_files';
    const screenshotDir = path.join(config.screenshotsDir, reportId);
    const attachmentDir = path.join(config.attachmentsDir, reportId);

    fs.mkdirSync(screenshotDir, { recursive: true });
    fs.mkdirSync(attachmentDir, { recursive: true });
    fs.writeFileSync(path.join(screenshotDir, 'a.png'), pngBuffer);
    fs.writeFileSync(path.join(attachmentDir, 'b.txt'), 'hello');

    const removed = await deleteReportFiles(reportId);
    expect(removed).toBe(2);
  });

  it('manages user avatars', async () => {
    const userId = 'usr_1';
    const saved = await saveAvatar({
      userId,
      filename: 'avatar.png',
      mimeType: 'image/png',
      data: pngBuffer,
    });

    expect(fileExists(saved.path)).toBe(true);

    const deleted = deleteAvatar(userId, saved.filename);
    expect(deleted).toBe(true);

    const userDir = path.join(config.avatarsDir, userId);
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(path.join(userDir, 'extra.png'), pngBuffer);
    fs.writeFileSync(path.join(userDir, 'extra2.png'), pngBuffer);

    const count = deleteAllAvatars(userId);
    expect(count).toBe(2);
  });

  it('handles avatar cleanup when nothing exists', () => {
    expect(deleteAvatar('usr_missing', 'missing.png')).toBe(false);
    expect(deleteAllAvatars('usr_missing')).toBe(0);
  });

  it('reads image dimensions for jpeg and webp', async () => {
    const jpeg = await saveFile({
      reportId: 'rpt_jpeg',
      type: 'screenshot',
      filename: 'shot.jpg',
      mimeType: 'image/jpeg',
      data: jpegBuffer,
    });
    expect(jpeg.width).toBe(3);
    expect(jpeg.height).toBe(2);

    const webp = await saveFile({
      reportId: 'rpt_webp',
      type: 'screenshot',
      filename: 'shot.webp',
      mimeType: 'image/webp',
      data: createWebpBufferVp8(5, 6),
    });
    expect(webp.width).toBe(5);
    expect(webp.height).toBe(6);

    const webpLossless = await saveFile({
      reportId: 'rpt_webp_l',
      type: 'screenshot',
      filename: 'shot.webp',
      mimeType: 'image/webp',
      data: createWebpBufferVp8l(4, 7),
    });
    expect(webpLossless.width).toBe(4);
    expect(webpLossless.height).toBe(7);
  });

  it('returns null on read failures', async () => {
    const dirPath = path.join(tempDir, 'read-fail');
    fs.mkdirSync(dirPath, { recursive: true });
    expect(readFile(dirPath)).toBeNull();
    expect(await deleteFile(dirPath)).toBe(false);
  });
});

describe('validateFile', () => {
  it('accepts valid PNG screenshot', () => {
    const result = validateFile({ data: pngBuffer, mimeType: 'image/png', type: 'screenshot' });
    expect(result.success).toBe(true);
  });

  it('accepts valid JPEG screenshot', () => {
    const result = validateFile({ data: jpegBuffer, mimeType: 'image/jpeg', type: 'screenshot' });
    expect(result.success).toBe(true);
  });

  it('accepts valid WebP screenshot', () => {
    const result = validateFile({
      data: createWebpBufferVp8(10, 10),
      mimeType: 'image/webp',
      type: 'screenshot',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid GIF screenshot', () => {
    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00]);
    const result = validateFile({ data: gif, mimeType: 'image/gif', type: 'screenshot' });
    expect(result.success).toBe(true);
  });

  it('rejects disallowed MIME type for screenshot', () => {
    const result = validateFile({
      data: Buffer.from('hello'),
      mimeType: 'text/plain',
      type: 'screenshot',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_MIME_TYPE');
    }
  });

  it('rejects disallowed MIME type for video', () => {
    const result = validateFile({ data: pngBuffer, mimeType: 'image/png', type: 'video' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_MIME_TYPE');
    }
  });

  it('rejects file exceeding size limit', () => {
    const bigBuffer = Buffer.alloc(2 * 1024 * 1024); // 2MB
    // Write PNG header so magic bytes pass
    pngBuffer.copy(bigBuffer);
    const result = validateFile({
      data: bigBuffer,
      mimeType: 'image/png',
      type: 'screenshot',
      maxSizeMb: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('FILE_TOO_LARGE');
    }
  });

  it('rejects file with mismatched magic bytes', () => {
    // Claim PNG but provide JPEG bytes
    const result = validateFile({ data: jpegBuffer, mimeType: 'image/png', type: 'screenshot' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_FILE_CONTENT');
    }
  });

  it('validates file content without applying a size limit', () => {
    const largePng = Buffer.alloc(2 * 1024 * 1024);
    pngBuffer.copy(largePng);

    expect(
      validateFileContent({ data: largePng, mimeType: 'image/png', type: 'screenshot' }).success
    ).toBe(true);
    expect(
      validateFileContent({ data: jpegBuffer, mimeType: 'image/png', type: 'screenshot' }).success
    ).toBe(false);
  });

  it('rejects PNG magic bytes when declared as JPEG', () => {
    const result = validateFile({ data: pngBuffer, mimeType: 'image/jpeg', type: 'screenshot' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_FILE_CONTENT');
    }
  });

  it('accepts valid attachment types', () => {
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
    const result = validateFile({ data: pdf, mimeType: 'application/pdf', type: 'attachment' });
    expect(result.success).toBe(true);
  });

  it('rejects image MIME type for attachments', () => {
    const result = validateFile({ data: pngBuffer, mimeType: 'image/png', type: 'attachment' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_MIME_TYPE');
    }
  });

  it('uses default size limit when maxSizeMb not provided', () => {
    const smallPng = Buffer.alloc(100);
    pngBuffer.copy(smallPng);
    const result = validateFile({ data: smallPng, mimeType: 'image/png', type: 'screenshot' });
    expect(result.success).toBe(true);
  });
});
