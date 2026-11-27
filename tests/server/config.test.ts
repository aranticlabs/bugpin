import { describe, it, expect, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

const originalNodeEnv = process.env.NODE_ENV;
const originalDataDir = process.env.DATA_DIR;
const additionalEnv = Object.fromEntries(
  ['PORT', 'HOST', 'TRUST_PROXY', 'PROXY_TOKEN_FILE'].map((key) => [key, process.env[key]])
);

afterEach(() => {
  for (const [key, value] of Object.entries(additionalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
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
  it.each([
    ['development', 4300],
    ['production', 7300],
  ] as const)('defaults to the correct port and host in %s', async (mode, port) => {
    const directory = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-config-'));
    process.env.NODE_ENV = mode;
    process.env.DATA_DIR = directory;
    delete process.env.PORT;
    delete process.env.HOST;
    try {
      const { config } = await importConfig(`defaults-${mode}`);
      expect(config.port).toBe(port);
      expect(config.host).toBe('0.0.0.0');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('reads binding overrides, token trust mode, and the token export path', async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '8123';
    process.env.HOST = '127.0.0.1';
    process.env.TRUST_PROXY = 'token';
    process.env.PROXY_TOKEN_FILE = '/run/bugpin/proxy-token';
    const { config } = await importConfig('binding-overrides');
    expect(config.port).toBe(8123);
    expect(config.host).toBe('127.0.0.1');
    expect(config.trustProxy).toBe('token');
    expect(config.proxyTokenFile).toBe('/run/bugpin/proxy-token');
  });

  it.each(['0', '65536', 'invalid', '43.5'])('rejects invalid PORT=%s', async (port) => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = port;
    await expect(importConfig(`invalid-port-${port}`)).rejects.toThrow();
  });

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
