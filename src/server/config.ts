import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

// Read version from root package.json (single source of truth)
// Uses synchronous read to avoid top-level await, which breaks require() in the EE loader
const packageJsonPath = path.join(path.resolve(import.meta.dir, '../..'), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const VERSION: string = packageJson.version;

const configSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('production'),
  dataDir: z.string(), // Always provided by loadConfig, never uses default
  secretKey: z.string().min(32, 'SECRET_KEY must be at least 32 characters'),
});

/**
 * Get or generate the secret key.
 * Reads from .secret file in dataDir, or generates a new one on first run.
 */
function getSecretKey(dataDir: string): string {
  const secretFilePath = path.join(dataDir, '.secret');

  // Try to read existing key
  try {
    if (fs.existsSync(secretFilePath)) {
      const existingKey = fs.readFileSync(secretFilePath, 'utf-8').trim();
      if (existingKey.length >= 32) {
        return existingKey;
      }
    }
  } catch {
    // File doesn't exist or can't be read, will generate new key
  }

  // Generate new secret key
  const newKey = crypto.randomBytes(32).toString('base64');

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Save the key with restricted permissions
  fs.writeFileSync(secretFilePath, newKey, { mode: 0o600 });
  console.log(`Generated new secret key and saved to ${secretFilePath}`);

  return newKey;
}

function loadConfig() {
  const nodeEnv = process.env.NODE_ENV || 'production';
  const isDevelopment = nodeEnv === 'development';
  const isTest = nodeEnv === 'test';

  // Project root is 2 directories up from src/server/config.ts
  const projectRoot = path.resolve(import.meta.dir, '../..');

  // Default data directory is at project root, not relative to server
  const dataDir = process.env.DATA_DIR || path.join(projectRoot, 'data');

  // Get or generate secret key
  const secretKey =
    isDevelopment || isTest
      ? 'development-secret-key-for-local-testing-only'
      : getSecretKey(dataDir);

  const env = {
    nodeEnv,
    dataDir,
    secretKey,
  };

  const parsed = configSchema.parse(env);

  return {
    ...parsed,
    // Hardcoded values (port 7301 in dev for Vite proxy, 7300 in production)
    port: isDevelopment ? 7301 : 7300,
    host: '0.0.0.0',
    adminEmail: 'admin@example.com',
    adminPassword: 'changeme123',
    // Derived values
    version: VERSION,
    projectRoot,
    dbPath: path.join(parsed.dataDir, 'bugpin.db'),
    uploadsDir: path.join(parsed.dataDir, 'uploads'),
    screenshotsDir: path.join(parsed.dataDir, 'uploads', 'screenshots'),
    attachmentsDir: path.join(parsed.dataDir, 'uploads', 'attachments'),
    brandingDir: path.join(parsed.dataDir, 'uploads', 'branding'),
    defaultBrandingDir: path.join(projectRoot, 'src/admin/public/branding'),
    avatarsDir: path.join(parsed.dataDir, 'uploads', 'avatars'),
    adminDir: path.join(projectRoot, 'dist/admin'),
    widgetDir: path.join(projectRoot, 'src/widget/dist'),
    migrationsDir: path.join(projectRoot, 'src/server/database/migrations'),
    corsOrigins: ['*'], // Allow all - project whitelists handle domain restrictions
    isDev: parsed.nodeEnv === 'development',
    isProd: parsed.nodeEnv === 'production',
    isTest: parsed.nodeEnv === 'test',
  };
}

export const config = loadConfig();
export type Config = typeof config;
