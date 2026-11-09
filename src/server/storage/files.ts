import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config.js';
import { generateFileId } from '../utils/id.js';
import { logger } from '../utils/logger.js';
import { getEEHooks } from '../utils/ee-hooks.js';
import { filesRepo } from '../database/repositories/files.repo.js';
import { settingsRepo } from '../database/repositories/settings.repo.js';
import { Result } from '../utils/result.js';
import type { FileType } from '@shared/types';

// Allowed MIME types per file category

const ALLOWED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
] as const;

const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'application/json',
] as const;

export const ALLOWED_MEDIA_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_VIDEO_MIME_TYPES,
] as const;

const DEFAULT_MAX_FILE_SIZE_MB = 10;
const MAX_VIDEO_SIZE_MB = 50;

// Magic byte signatures for file type verification
const MAGIC_BYTES: Record<string, { bytes: number[]; offset: number }[]> = {
  'image/png': [{ bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0 }],
  'image/jpeg': [{ bytes: [0xff, 0xd8], offset: 0 }],
  'image/jpg': [{ bytes: [0xff, 0xd8], offset: 0 }],
  'image/gif': [
    { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], offset: 0 }, // GIF87a
    { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], offset: 0 }, // GIF89a
  ],
  'image/webp': [
    { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF header
  ],
  'video/mp4': [{ bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }], // ftyp at offset 4
  'video/webm': [{ bytes: [0x1a, 0x45, 0xdf, 0xa3], offset: 0 }], // EBML header
  'video/quicktime': [{ bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }], // ftyp at offset 4
};

function matchesMagicBytes(
  data: Buffer | Uint8Array,
  signatures: { bytes: number[]; offset: number }[]
): boolean {
  return signatures.some((sig) => {
    if (data.length < sig.offset + sig.bytes.length) return false;
    return sig.bytes.every((byte, i) => data[sig.offset + i] === byte);
  });
}

export interface ValidateFileOptions {
  data: Buffer | Uint8Array;
  mimeType: string;
  type: FileType;
  maxSizeMb?: number;
}

export type ValidateFileContentOptions = Omit<ValidateFileOptions, 'maxSizeMb'>;

export function validateFileContent(options: ValidateFileContentOptions): Result<void> {
  const { data, mimeType, type } = options;
  const allowedTypes: readonly string[] =
    type === 'attachment'
      ? ALLOWED_ATTACHMENT_MIME_TYPES
      : type === 'video'
        ? ALLOWED_VIDEO_MIME_TYPES
        : type === 'screenshot'
          ? ALLOWED_IMAGE_MIME_TYPES
          : ALLOWED_MEDIA_MIME_TYPES;

  if (!allowedTypes.includes(mimeType)) {
    return Result.fail(
      `MIME type "${mimeType}" is not allowed for ${type} uploads`,
      'INVALID_MIME_TYPE'
    );
  }
  const signatures = MAGIC_BYTES[mimeType];
  if (signatures && !matchesMagicBytes(data, signatures)) {
    return Result.fail(
      `File content does not match declared MIME type "${mimeType}"`,
      'INVALID_FILE_CONTENT'
    );
  }

  return Result.ok(undefined);
}

export function validateFile(options: ValidateFileOptions): Result<void> {
  const contentValidation = validateFileContent(options);
  if (!contentValidation.success) {
    return contentValidation;
  }

  const sizeMb = options.data.length / (1024 * 1024);
  const limit =
    options.maxSizeMb ?? (options.type === 'video' ? MAX_VIDEO_SIZE_MB : DEFAULT_MAX_FILE_SIZE_MB);
  if (sizeMb > limit) {
    return Result.fail(
      `File size ${sizeMb.toFixed(1)}MB exceeds the ${limit}MB limit`,
      'FILE_TOO_LARGE'
    );
  }

  return Result.ok(undefined);
}

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

    if (!getEEHooks().getStorageProvider()?.acceptsUploads()) {
      logger.warn('S3 enabled in settings but S3 storage is not licensed');
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
  const buffer = Buffer.isBuffer(data)
    ? data
    : Buffer.from(data.buffer, data.byteOffset, data.byteLength);

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
          path: `s3://${result.value.bucket}/${result.value.key}`,
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
  try {
    fs.writeFileSync(filePath, buffer);
  } catch (error) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    throw error;
  }

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

export interface StoredFileHandle {
  kind: 'local' | 'remote';
  exists(): Promise<boolean>;
  read(): Promise<Blob | Uint8Array | null>;
  readRange(start: number, end: number): Promise<Blob | Uint8Array | null>;
}

export function createStoredFileHandle(filePath: string): StoredFileHandle {
  if (!isS3Url(filePath)) {
    const resolvedPath = path.resolve(config.projectRoot, filePath);
    return {
      kind: 'local',
      async exists() {
        return Bun.file(resolvedPath).exists();
      },
      async read() {
        const file = Bun.file(resolvedPath);
        return (await file.exists()) ? file : null;
      },
      async readRange(start, end) {
        const file = Bun.file(resolvedPath);
        return (await file.exists()) ? file.slice(start, end + 1) : null;
      },
    };
  }

  return {
    kind: 'remote',
    async exists() {
      const provider = getEEHooks().getStorageProvider();
      if (!provider) return false;
      const result = await provider.exists(filePath);
      if (!result.success) {
        logger.error('Failed to check stored object', { path: filePath, error: result.error });
        return false;
      }
      return result.value;
    },
    async read() {
      const provider = getEEHooks().getStorageProvider();
      if (!provider) return null;
      const result = await provider.read(filePath);
      if (!result.success) {
        logger.error('Failed to read stored object', { path: filePath, error: result.error });
        return null;
      }
      return result.value;
    },
    async readRange(start, end) {
      const provider = getEEHooks().getStorageProvider();
      if (!provider) return null;
      const result = provider.readRange
        ? await provider.readRange(filePath, start, end)
        : await provider.read(filePath);
      if (!result.success) {
        logger.error('Failed to read stored object', { path: filePath, error: result.error });
        return null;
      }
      return provider.readRange ? result.value : result.value.subarray(start, end + 1);
    },
  };
}

export async function readStoredFile(filePath: string): Promise<Buffer | null> {
  if (!isS3Url(filePath)) return readFile(path.resolve(config.projectRoot, filePath));
  const provider = getEEHooks().getStorageProvider();
  if (!provider) return null;
  const result = await provider.read(filePath);
  if (!result.success) {
    logger.error('Failed to read stored object', { path: filePath, error: result.error });
    return null;
  }
  return Buffer.from(result.value);
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
        const result = await storageProvider.delete(filePath);
        if (result.success) return true;
        logger.error('Failed to delete stored object', { path: filePath, error: result.error });
        return false;
      }
      logger.warn('Cannot delete S3 file: storage provider not available', { path: filePath });
      return false;
    }

    filePath = path.resolve(config.projectRoot, filePath);
    // Local file deletion
    if (!fs.existsSync(filePath)) return true;
    fs.unlinkSync(filePath);
    logger.info('File deleted from local storage', { path: filePath });
    return true;
  } catch (error) {
    logger.error('Failed to delete file', error, { path: filePath });
    return false;
  }
}

/**
 * Delete stored files before removing their database references.
 */
export async function deleteReportFiles(reportId: string): Promise<number> {
  let count = 0;
  for (const file of await filesRepo.findByReportId(reportId)) {
    if (!(await deleteFile(file.path))) throw new Error(`Unable to delete stored file ${file.id}`);
    count++;
  }

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
    if (!fs.existsSync(filePath)) return false;
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
  const { mode, data, type = 'logo' } = options;

  const modeDir = path.join(config.brandingDir, mode);

  // Ensure directory exists
  if (!fs.existsSync(modeDir)) {
    fs.mkdirSync(modeDir, { recursive: true });
  }

  // Import sharp for image processing
  const sharp = (await import('sharp')).default;

  let image = sharp(Buffer.from(data), { limitInputPixels: 16_000_000 });
  if (type === 'icon') image = image.resize(256, 256, { fit: 'cover', position: 'center' });
  const processedData = await image.png().toBuffer();
  const finalMimeType = 'image/png';
  const ext = 'png';

  const filename = `${type}-${mode}-${crypto.randomUUID()}.${ext}`;
  const filePath = path.join(modeDir, filename);

  const finalMetadata = await sharp(processedData).metadata();
  const stagedPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(stagedPath, processedData);
    fs.renameSync(stagedPath, filePath);
  } finally {
    fs.rmSync(stagedPath, { force: true });
  }

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
  data: Buffer | Uint8Array
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
async function generateFaviconSizes(
  sourceBuffer: Buffer,
  mode: 'light' | 'dark'
): Promise<FaviconSet> {
  const sharp = (await import('sharp')).default;
  const modeDir = path.join(config.brandingDir, mode);

  // Ensure directory exists
  if (!fs.existsSync(modeDir)) {
    fs.mkdirSync(modeDir, { recursive: true });
  }

  const version = crypto.randomUUID();
  const finalDir = path.join(modeDir, `favicons-${version}`);
  const stagedDir = `${finalDir}.tmp`;
  fs.mkdirSync(stagedDir);
  try {
    const sizes = [180, 192, 512, 32];
    const images = await Promise.all(
      sizes.map((size) =>
        sharp(sourceBuffer, { limitInputPixels: 16_000_000 })
          .resize(size, size, { fit: 'cover', position: 'center' })
          .png()
          .toBuffer()
      )
    );
    const names = [
      `apple-touch-icon-${mode}.png`,
      `android-chrome-192x192-${mode}.png`,
      `android-chrome-512x512-${mode}.png`,
      `favicon-${mode}.ico`,
    ];
    const header = Buffer.alloc(22);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(1, 4);
    header[6] = 32;
    header[7] = 32;
    header.writeUInt16LE(1, 10);
    header.writeUInt16LE(32, 12);
    header.writeUInt32LE(images[3].length, 14);
    header.writeUInt32LE(22, 18);
    images[3] = Buffer.concat([header, images[3]]);
    for (let index = 0; index < names.length; index++)
      fs.writeFileSync(path.join(stagedDir, names[index]), images[index]);
    fs.renameSync(stagedDir, finalDir);
    return {
      appleTouchIcon: path.join(finalDir, names[0]),
      androidChrome192: path.join(finalDir, names[1]),
      androidChrome512: path.join(finalDir, names[2]),
      ico: path.join(finalDir, names[3]),
      version,
    };
  } finally {
    fs.rmSync(stagedDir, { recursive: true, force: true });
  }
}

/**
 * Delete branding asset (logo, icon, or favicon set)
 */
export function deleteBrandingAsset(
  mode: 'light' | 'dark',
  type: 'logo' | 'icon' | 'favicon'
): boolean {
  const modeDir = path.join(config.brandingDir, mode);

  if (!fs.existsSync(modeDir)) {
    return false;
  }

  let deleted = false;
  for (const name of fs.readdirSync(modeDir)) {
    if (
      (type === 'favicon' && name.startsWith('favicons-')) ||
      (type !== 'favicon' && name.startsWith(`${type}-${mode}-`))
    ) {
      fs.rmSync(path.join(modeDir, name), { recursive: true, force: true });
      deleted = true;
    }
  }

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
