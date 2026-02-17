import { describe, it, expect, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

const originalNodeEnv = process.env.NODE_ENV;
const originalDataDir = process.env.DATA_DIR;

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
  if (originalDataDir === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = originalDataDir;
  }
});

async function importConfig(tag: string) {
  return import(`../../src/server/config.js?test=${tag}`);
}

describe('config', () => {
  it('uses the test secret key in test environment', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.DATA_DIR;

    const { config } = await importConfig('test-env');
    expect(config.secretKey).toBe('development-secret-key-for-local-testing-only');
    expect(config.isTest).toBe(true);
  });

  it('reads secret key from existing file in production', async () => {
    const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-secret-'));
    const secretPath = path.join(tempDir, '.secret');
    const secret = 'x'.repeat(32);
    fs.writeFileSync(secretPath, secret);

    process.env.NODE_ENV = 'production';
    process.env.DATA_DIR = tempDir;

    try {
      const { config } = await importConfig('prod-existing');
      expect(config.secretKey).toBe(secret);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('generates a secret key when missing in production', async () => {
    const baseDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-secret-missing-'));
    const dataDir = path.join(baseDir, 'data');

    process.env.NODE_ENV = 'production';
    process.env.DATA_DIR = dataDir;

    try {
      const { config } = await importConfig('prod-generated');
      const secretPath = path.join(dataDir, '.secret');
      expect(fs.existsSync(secretPath)).toBe(true);
      expect(config.secretKey.length).toBeGreaterThanOrEqual(32);
    } finally {
      fs.rmSync(baseDir, { recursive: true, force: true });
    }
  });
});
