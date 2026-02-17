import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config.js';
import { generateFileId } from '../utils/id.js';
import { logger } from '../utils/logger.js';
import { getEEHooks } from '../utils/ee-hooks.js';
import { settingsRepo } from '../database/repositories/settings.repo.js';
import type { FileType } from '@shared/types';

// File Storage Service

export interface SaveFileOptions {
  reportId: string;
  type: FileType;
  filename: string;
  mimeType: string;
  data: Buffer | Uint8Array;
}

export interface SavedFile {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

/**
 * Get the directory path for a file type
 */
function getTypeDir(type: FileType): string {
  switch (type) {
    case 'screenshot':
      return config.screenshotsDir;
    case 'attachment':
      return config.attachmentsDir;
    case 'video':
      return config.screenshotsDir; // Videos go with screenshots
    default:
      return config.attachmentsDir;
  }
}

/**
 * Get file extension from mime type
 */
function getExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/mpeg': 'mpeg',
    'video/quicktime': 'mov',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'application/json': 'json',
  };

  return mimeToExt[mimeType] || 'bin';
}

/**
 * Check if S3 storage should be used
 */
async function shouldUseS3(): Promise<boolean> {
  try {
    const settings = await settingsRepo.getAll();
    if (!settings.s3Enabled) {
      return false;
    }

    const storageProvider = getEEHooks().getStorageProvider();
    if (!storageProvider) {
      logger.warn('S3 enabled in settings but EE storage provider not available');
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error checking S3 availability', { error });
    return false;
  }
}

/**
 * Save a file to the filesystem or S3 (if EE is available and S3 is configured)
 */
export async function saveFile(options: SaveFileOptions): Promise<SavedFile> {
  const { reportId, type, mimeType, data } = options;

  // Generate unique filename
  const fileId = generateFileId();
  const ext = getExtension(mimeType);
  const storedFilename = `${fileId}.${ext}`;
  const buffer = Buffer.from(data);

  // Get image dimensions if applicable (needed for both local and S3)
  let width: number | undefined;
  let height: number | undefined;

  if (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml') {
    const dimensions = getImageDimensions(buffer);
    if (dimensions) {
      width = dimensions.width;
      height = dimensions.height;
    }
  }

  // Check if S3 storage should be used
  if (await shouldUseS3()) {
    const storageProvider = getEEHooks().getStorageProvider();
    if (storageProvider) {
      // Build S3 key: {type}/{reportId}/{filename}
      const s3Key = `${type}/${reportId}/${storedFilename}`;

      const result = await storageProvider.upload({
        key: s3Key,
        body: buffer,
        contentType: mimeType,
        metadata: {
          reportId,
          fileType: type,
          originalFilename: options.filename,
        },
      });

      if (result.success) {
        logger.info('File saved to S3', {
          fileId,
          reportId,
          type,
          key: s3Key,
          size: buffer.length,
        });

        return {
          id: fileId,
          path: result.value.url, // S3 URL
          filename: storedFilename,
          mimeType,
          sizeBytes: buffer.length,
          width,
          height,
        };
      }

      // S3 upload failed - log warning and fall back to local storage
      logger.warn('S3 upload failed, falling back to local storage', {
        error: result.error,
        reportId,
        type,
      });
    }
  }

  // Local storage fallback
  const typeDir = getTypeDir(type);
  const reportDir = path.join(typeDir, reportId);

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const filePath = path.join(reportDir, storedFilename);
  fs.writeFileSync(filePath, buffer);

  logger.info('File saved to local storage', {
    fileId,
    reportId,
    type,
    path: filePath,
    size: buffer.length,
  });

  return {
    id: fileId,
    path: filePath,
    filename: storedFilename,
    mimeType,
    sizeBytes: buffer.length,
    width,
    height,
  };
}

/**
 * Get image dimensions from buffer
 * Supports PNG and JPEG
 */
function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  try {
    // PNG: Check for PNG signature and read IHDR chunk
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }

    // JPEG: Find SOF0 or SOF2 marker
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) break;

        const marker = buffer[offset + 1];
        const length = buffer.readUInt16BE(offset + 2);

        // SOF0, SOF1, SOF2, SOF3, SOF5, SOF6, SOF7, SOF9, SOF10, SOF11, SOF13, SOF14, SOF15
        if (
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf)
        ) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }

        offset += 2 + length;
      }
    }

    // WebP: Check for RIFF header
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
      // VP8L (lossless)
      if (buffer.toString('ascii', 12, 16) === 'VP8L') {
        const bits = buffer.readUInt32LE(21);
        const width = (bits & 0x3fff) + 1;
        const height = ((bits >> 14) & 0x3fff) + 1;
        return { width, height };
      }
      // VP8 (lossy)
      if (buffer.toString('ascii', 12, 16) === 'VP8 ') {
        const width = buffer.readUInt16LE(26) & 0x3fff;
        const height = buffer.readUInt16LE(28) & 0x3fff;
        return { width, height };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Read a file from the filesystem
 */
export function readFile(filePath: string): Buffer | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath);
  } catch (error) {
    logger.error('Failed to read file', error, { path: filePath });
    return null;
  }
}

/**
 * Check if a path is an S3 URL
 */
function isS3Url(path: string): boolean {
  return path.startsWith('https://') || path.startsWith('http://') || path.startsWith('s3://');
}

/**
 * Extract S3 key from URL
 * Handles various S3 URL formats:
 * - https://bucket.s3.region.amazonaws.com/key
 * - https://s3.region.amazonaws.com/bucket/key
 * - s3://bucket/key
 */
function extractS3KeyFromUrl(url: string): string | null {
  try {
    if (url.startsWith('s3://')) {
      // s3://bucket/key -> key
      const parts = url.replace('s3://', '').split('/');
      return parts.slice(1).join('/');
    }

    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    // Remove leading slash and bucket name if in path-style URL
    if (pathname.startsWith('/')) {
      const parts = pathname.slice(1).split('/');
      // If hostname contains bucket name, pathname is the key
      if (urlObj.hostname.includes('.s3.')) {
        return parts.join('/');
      }
      // Otherwise, first part is bucket, rest is key
      return parts.slice(1).join('/');
    }

    return pathname;
  } catch {
    return null;
  }
}

/**
 * Delete a file from the filesystem or S3
 */
export async function deleteFile(filePath: string): Promise<boolean> {
  try {
    // Check if this is an S3 URL
    if (isS3Url(filePath)) {
      const storageProvider = getEEHooks().getStorageProvider();
      if (storageProvider) {
        const s3Key = extractS3KeyFromUrl(filePath);
        if (s3Key) {
          const result = await storageProvider.delete(s3Key);
          if (result.success) {
            logger.info('File deleted from S3', { key: s3Key });
            return true;
          }
          logger.error('Failed to delete file from S3', { key: s3Key, error: result.error });
          return false;
        }
      }
      logger.warn('Cannot delete S3 file: storage provider not available', { path: filePath });
      return false;
    }

    // Local file deletion
    if (!fs.existsSync(filePath)) {
      return false;
    }
    fs.unlinkSync(filePath);
    logger.info('File deleted from local storage', { path: filePath });
    return true;
  } catch (error) {
    logger.error('Failed to delete file', error, { path: filePath });
    return false;
  }
}

/**
 * Delete all LOCAL files for a report
 *
 * Note: This only deletes local files. S3 files should be deleted individually
 * through `deleteFile()` when attachments/screenshots are removed from the database.
 * The database tracks the actual path (local or S3 URL) for each file.
 */
export function deleteReportFiles(reportId: string): number {
  let count = 0;

  for (const dir of [config.screenshotsDir, config.attachmentsDir]) {
    const reportDir = path.join(dir, reportId);
    if (fs.existsSync(reportDir)) {
      const files = fs.readdirSync(reportDir);
      for (const file of files) {
        fs.unlinkSync(path.join(reportDir, file));
        count++;
      }
      fs.rmdirSync(reportDir);
    }
  }

  logger.info('Report files deleted', { reportId, count });
  return count;
}

/**
 * Get file stats
 */
export function getFileStats(filePath: string): { size: number; mtime: Date } | null {
  try {
    const stats = fs.statSync(filePath);
    return { size: stats.size, mtime: stats.mtime };
  } catch {
    return null;
  }
}

/**
 * Check if file exists
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

// Avatar Functions

export interface SaveAvatarOptions {
  userId: string;
  filename: string;
  mimeType: string;
  data: Buffer | Uint8Array;
}

/**
 * Save an avatar to the filesystem
 */
export async function saveAvatar(options: SaveAvatarOptions): Promise<SavedFile> {
  const { userId, mimeType, data } = options;

  // Generate unique filename
  const fileId = generateFileId();
  const ext = getExtension(mimeType);
  const storedFilename = `${fileId}.${ext}`;

  // Create directory structure: avatars/{userId}/
  const userDir = path.join(config.avatarsDir, userId);

  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  // Full file path
  const filePath = path.join(userDir, storedFilename);

  // Write file
  const buffer = Buffer.from(data);
  fs.writeFileSync(filePath, buffer);

  logger.info('Avatar saved', { fileId, userId, path: filePath, size: buffer.length });

  // Get image dimensions
  let width: number | undefined;
  let height: number | undefined;

  if (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml') {
    const dimensions = getImageDimensions(buffer);
    if (dimensions) {
      width = dimensions.width;
      height = dimensions.height;
    }
  }

  return {
    id: fileId,
    path: filePath,
    filename: storedFilename,
    mimeType,
    sizeBytes: buffer.length,
    width,
    height,
  };
}

/**
 * Delete user's avatar
 */
export function deleteAvatar(userId: string, filename: string): boolean {
  try {
    const filePath = path.join(config.avatarsDir, userId, filename);
    if (!fs.existsSync(filePath)) {
      return false;
    }
    fs.unlinkSync(filePath);
    logger.info('Avatar deleted', { userId, path: filePath });
    return true;
  } catch (error) {
    logger.error('Failed to delete avatar', error, { userId, filename });
    return false;
  }
}

/**
 * Delete all avatars for a user
 */
export function deleteAllAvatars(userId: string): number {
  let count = 0;
  const userDir = path.join(config.avatarsDir, userId);

  if (fs.existsSync(userDir)) {
    const files = fs.readdirSync(userDir);
    for (const file of files) {
      fs.unlinkSync(path.join(userDir, file));
      count++;
    }
    fs.rmdirSync(userDir);
  }

  logger.info('All avatars deleted', { userId, count });
  return count;
}

// Branding File Storage

export interface SaveBrandingLogoOptions {
  mode: 'light' | 'dark';
  filename: string;
  mimeType: string;
  data: Buffer | Uint8Array;
  type?: 'logo' | 'icon'; // defaults to 'logo'
}

export interface FaviconSet {
  ico: string;
  appleTouchIcon: string; // 180x180
  androidChrome192: string; // 192x192
  androidChrome512: string; // 512x512
  version: string;
}

/**
 * Save branding logo or icon (light or dark mode)
 * Icons are resized to 256x256 for optimal sidebar display
 * Logos are kept at original size (up to 2000px)
 */
export async function saveBrandingLogo(options: SaveBrandingLogoOptions): Promise<SavedFile> {
  const { mode, mimeType, data, type = 'logo' } = options;

  const modeDir = path.join(config.brandingDir, mode);

  // Ensure directory exists
  if (!fs.existsSync(modeDir)) {
    fs.mkdirSync(modeDir, { recursive: true });
  }

  // Import sharp for image processing
  const sharp = (await import('sharp')).default;

  let processedData: Buffer;
  let finalMimeType = mimeType;
  let ext = getExtension(mimeType);

  if (type === 'icon') {
    // Resize icons to 256x256 for optimal sidebar display
    // Convert to PNG for consistent quality
    processedData = await sharp(Buffer.from(data))
      .resize(256, 256, {
        fit: 'cover',
        position: 'center',
      })
      .png()
      .toBuffer();
    finalMimeType = 'image/png';
    ext = 'png';
  } else {
    // For logos, keep original size (no dimension restrictions for email headers etc.)
    processedData = Buffer.from(data);
  }

  const filename = `${type}-${mode}.${ext}`;
  const filePath = path.join(modeDir, filename);

  // Save file
  fs.writeFileSync(filePath, processedData);

  // Get final dimensions
  const finalMetadata = await sharp(processedData).metadata();

  logger.info(`Branding ${type} saved`, { mode, filename, size: processedData.length });

  return {
    id: `branding-${type}-${mode}`,
    path: filePath,
    filename,
    mimeType: finalMimeType,
    sizeBytes: processedData.length,
    width: finalMetadata.width,
    height: finalMetadata.height,
  };
}

/**
 * Save branding favicon and generate all sizes
 */
export async function saveBrandingFavicon(
  mode: 'light' | 'dark',
  data: Buffer | Uint8Array,
): Promise<FaviconSet> {
  const sharp = (await import('sharp')).default;

  // Validate source image
  const metadata = await sharp(Buffer.from(data)).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to determine image dimensions');
  }

  if (metadata.width < 512 || metadata.height < 512) {
    throw new Error('Favicon source must be at least 512x512px');
  }

  const modeDir = path.join(config.brandingDir, mode);

  // Ensure directory exists
  if (!fs.existsSync(modeDir)) {
    fs.mkdirSync(modeDir, { recursive: true });
  }

  // Generate all favicon sizes
  const faviconSet = await generateFaviconSizes(Buffer.from(data), mode);

  logger.info('Favicon set generated', { mode, sizes: Object.keys(faviconSet) });

  return faviconSet;
}

/**
 * Generate all favicon sizes from source image
 */
export async function generateFaviconSizes(
  sourceBuffer: Buffer,
  mode: 'light' | 'dark',
): Promise<FaviconSet> {
  const sharp = (await import('sharp')).default;
  const modeDir = path.join(config.brandingDir, mode);

  // Ensure directory exists
  if (!fs.existsSync(modeDir)) {
    fs.mkdirSync(modeDir, { recursive: true });
  }

  const faviconSet: Partial<FaviconSet> = {};

  // Generate Apple Touch Icon (180x180)
  const appleTouchBuffer = await sharp(sourceBuffer)
    .resize(180, 180, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();
  const appleTouchPath = path.join(modeDir, `apple-touch-icon-${mode}.png`);
  fs.writeFileSync(appleTouchPath, appleTouchBuffer);
  faviconSet.appleTouchIcon = appleTouchPath;

  // Generate Android Chrome 192x192
  const android192Buffer = await sharp(sourceBuffer)
    .resize(192, 192, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();
  const android192Path = path.join(modeDir, `android-chrome-192x192-${mode}.png`);
  fs.writeFileSync(android192Path, android192Buffer);
  faviconSet.androidChrome192 = android192Path;

  // Generate Android Chrome 512x512
  const android512Buffer = await sharp(sourceBuffer)
    .resize(512, 512, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();
  const android512Path = path.join(modeDir, `android-chrome-512x512-${mode}.png`);
  fs.writeFileSync(android512Path, android512Buffer);
  faviconSet.androidChrome512 = android512Path;

  // Generate .ico file
  const icoPath = path.join(modeDir, `favicon-${mode}.ico`);
  await generateIcoFile(sourceBuffer, icoPath);
  faviconSet.ico = icoPath;

  // Generate version hash
  faviconSet.version = Date.now().toString(36);

  return faviconSet as FaviconSet;
}

/**
 * Generate .ico file with multiple sizes embedded
 */
async function generateIcoFile(sourceBuffer: Buffer, outputPath: string): Promise<void> {
  const sharp = (await import('sharp')).default;

  // For .ico generation, we'll create a 32x32 PNG and save as .ico
  // Note: True multi-size .ico would require ico-endec or similar library
  // For now, we'll use a single 32x32 image as .ico
  const icoBuffer = await sharp(sourceBuffer)
    .resize(32, 32, {
      fit: 'cover',
      position: 'center',
    })
    .png()
    .toBuffer();

  fs.writeFileSync(outputPath, icoBuffer);
}

/**
 * Delete branding asset (logo, icon, or favicon set)
 */
export function deleteBrandingAsset(
  mode: 'light' | 'dark',
  type: 'logo' | 'icon' | 'favicon',
): boolean {
  const modeDir = path.join(config.brandingDir, mode);

  if (!fs.existsSync(modeDir)) {
    return false;
  }

  let deleted = false;

  if (type === 'logo') {
    // Delete logo files (try multiple extensions and naming conventions)
    const extensions = ['svg', 'png', 'jpg', 'jpeg', 'webp'];
    for (const ext of extensions) {
      // New naming with mode suffix
      const newPath = path.join(modeDir, `logo-${mode}.${ext}`);
      if (fs.existsSync(newPath)) {
        fs.unlinkSync(newPath);
        deleted = true;
      }
      // Old naming without mode suffix (for cleanup)
      const oldPath = path.join(modeDir, `logo.${ext}`);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
        deleted = true;
      }
    }
  } else if (type === 'icon') {
    // Delete icon files (try multiple extensions and naming conventions)
    const extensions = ['svg', 'png', 'jpg', 'jpeg', 'webp'];
    for (const ext of extensions) {
      // New naming with mode suffix
      const newPath = path.join(modeDir, `icon-${mode}.${ext}`);
      if (fs.existsSync(newPath)) {
        fs.unlinkSync(newPath);
        deleted = true;
      }
      // Old naming without mode suffix (for cleanup)
      const oldPath = path.join(modeDir, `icon.${ext}`);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
        deleted = true;
      }
    }
  } else if (type === 'favicon') {
    // Delete all favicon files (including both old and new naming conventions)
    const faviconFiles = [
      // New naming with mode suffix
      `favicon-${mode}.ico`,
      `apple-touch-icon-${mode}.png`,
      `android-chrome-192x192-${mode}.png`,
      `android-chrome-512x512-${mode}.png`,
      // Old naming without mode suffix (for cleanup)
      'favicon-16x16.png',
      'favicon-32x32.png',
      'apple-touch-icon.png',
      'favicon.ico',
      'favicon.png',
    ];
    for (const file of faviconFiles) {
      const filepath = path.join(modeDir, file);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        deleted = true;
      }
    }
  }

  logger.info('Branding asset deleted', { mode, type, deleted });
  return deleted;
}

/**
 * Initialize default branding assets
 * Just logs that defaults are ready - actual assets are served from defaultBrandingDir
 * Database stores null for URLs when using defaults
 */
export async function initDefaultBrandingUrls(): Promise<void> {
  logger.info('Default branding assets initialized');
}
