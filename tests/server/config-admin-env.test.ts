import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

const configPath = path.resolve(import.meta.dir, '../../src/server/config.ts');

// Config is evaluated at import time, so each case loads it in a fresh process.
function loadAdminConfig(env: Record<string, string>) {
  const dataDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-config-'));
  try {
    const script = `const { config } = await import(${JSON.stringify(configPath)});
console.log(JSON.stringify({ email: config.adminEmail, password: config.adminPassword, trustProxy: config.trustProxy }));`;
    const baseEnv = { ...process.env };
    delete baseEnv.ADMIN_EMAIL;
    delete baseEnv.ADMIN_PASSWORD;
    delete baseEnv.TRUST_PROXY;
    const result = Bun.spawnSync([process.execPath, '-e', script], {
      env: { ...baseEnv, NODE_ENV: 'test', DATA_DIR: dataDir, ...env },
    });
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

describe('admin bootstrap credentials from the environment', () => {
  it('falls back to the documented defaults', () => {
    const result = loadAdminConfig({});
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      email: 'admin@example.com',
      password: 'changeme123',
    });
  });

  it('uses ADMIN_EMAIL and ADMIN_PASSWORD when set', () => {
    const result = loadAdminConfig({
      ADMIN_EMAIL: ' Owner@Example.test ',
      ADMIN_PASSWORD: 'a-long-initial-password',
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      email: 'owner@example.test',
      password: 'a-long-initial-password',
    });
  });

  it('treats empty values as unset', () => {
    const result = loadAdminConfig({ ADMIN_EMAIL: '', ADMIN_PASSWORD: '   ' });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      email: 'admin@example.com',
      password: 'changeme123',
    });
  });

  it('refuses to start with an invalid email or a short password', () => {
    const invalidEmail = loadAdminConfig({ ADMIN_EMAIL: 'not-an-email' });
    expect(invalidEmail.exitCode).not.toBe(0);
    expect(invalidEmail.stderr).toContain('ADMIN_EMAIL must be a valid email address');

    const shortPassword = loadAdminConfig({ ADMIN_PASSWORD: 'short' });
    expect(shortPassword.exitCode).not.toBe(0);
    expect(shortPassword.stderr).toContain('ADMIN_PASSWORD must be at least 8 characters');
  });
});

describe('TRUST_PROXY', () => {
  it.each([
    [undefined, 'auto'],
    ['auto', 'auto'],
    ['true', 'always'],
    ['TRUE', 'always'],
    ['false', 'never'],
  ])('maps %s to %s', (value, expected) => {
    const result = loadAdminConfig(value === undefined ? {} : { TRUST_PROXY: value });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).trustProxy).toBe(expected);
  });

  it('refuses to start with an unknown value', () => {
    const result = loadAdminConfig({ TRUST_PROXY: 'sometimes' });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('TRUST_PROXY must be auto, true or false');
  });
});
