import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { Hono } from '../../src/server/node_modules/hono';
import { config } from '../../src/server/config';
import { httpsEnforcement } from '../../src/server/middleware/https-enforcement';
import { settingsCacheService } from '../../src/server/services/settings-cache.service';
import { logger } from '../../src/server/utils/logger';
import type { AppSettings } from '../../src/shared/types';

const originalConfig = { ...config };
const originalGetAll = settingsCacheService.getAll;
const originalWarn = logger.warn;

let enforceHttps = true;
let warnings: string[] = [];

function createApp() {
  const app = new Hono();
  app.use('*', httpsEnforcement);
  app.get('/health', (c) => c.text('ok'));
  return app;
}

function viaProxy(proto: 'http' | 'https') {
  return createApp().request(
    'http://bugpin.example.com/health',
    { headers: { 'x-forwarded-proto': proto } },
    { requestIP: () => ({ address: '127.0.0.1' }) }
  );
}

beforeEach(() => {
  enforceHttps = true;
  config.trustProxy = 'auto';
  warnings = [];
  settingsCacheService.getAll = async () => ({ enforceHttps }) as AppSettings;
  logger.warn = (message: string) => {
    warnings.push(message);
  };
});

afterEach(() => {
  Object.assign(config, originalConfig);
  settingsCacheService.getAll = originalGetAll;
  logger.warn = originalWarn;
});

describe('httpsEnforcement', () => {
  it('passes requests through when the setting is off', async () => {
    enforceHttps = false;
    const res = await viaProxy('http');
    expect(res.status).toBe(200);
    expect(res.headers.get('strict-transport-security')).toBeNull();
  });

  it('redirects HTTP to HTTPS when the setting is on', async () => {
    const res = await viaProxy('http');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://bugpin.example.com/health');
  });

  it('adds HSTS to HTTPS responses when the setting is on', async () => {
    const res = await viaProxy('https');
    expect(res.status).toBe(200);
    expect(res.headers.get('strict-transport-security')).toContain('max-age=31536000');
  });

  it('keeps loopback health checks available over HTTP when HTTPS is enforced', async () => {
    for (const host of ['localhost', '127.0.0.1', '127.0.0.2', '[::1]']) {
      const response = await createApp().request(`http://${host}/health`);
      expect(response.status).toBe(200);
      expect(response.headers.get('Location')).toBeNull();
    }
  });

  it('skips the redirect and HSTS when DISABLE_HTTPS_ENFORCEMENT is set', async () => {
    Object.assign(config, { disableHttpsEnforcement: true });

    const http = await viaProxy('http');
    expect(http.status).toBe(200);
    const https = await viaProxy('https');
    expect(https.headers.get('strict-transport-security')).toBeNull();

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('DISABLE_HTTPS_ENFORCEMENT');
  });
});

const configPath = path.resolve(import.meta.dir, '../../src/server/config.ts');

// Config is evaluated at import time, so each case loads it in a fresh process.
function loadDisableFlag(value: string | undefined): boolean {
  const dataDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-config-'));
  try {
    const script = `const { config } = await import(${JSON.stringify(configPath)});
console.log(JSON.stringify(config.disableHttpsEnforcement));`;
    const env: Record<string, string | undefined> = {
      ...process.env,
      NODE_ENV: 'test',
      DATA_DIR: dataDir,
      DISABLE_HTTPS_ENFORCEMENT: value,
    };
    if (value === undefined) delete env.DISABLE_HTTPS_ENFORCEMENT;
    const result = Bun.spawnSync([process.execPath, '-e', script], { env });
    expect(result.exitCode).toBe(0);
    return JSON.parse(result.stdout.toString()) as boolean;
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

describe('DISABLE_HTTPS_ENFORCEMENT', () => {
  it('is off unless set to true', () => {
    expect(loadDisableFlag(undefined)).toBe(false);
    expect(loadDisableFlag('')).toBe(false);
    expect(loadDisableFlag('false')).toBe(false);
    expect(loadDisableFlag('1')).toBe(false);
  });

  it('accepts true in any case', () => {
    expect(loadDisableFlag('true')).toBe(true);
    expect(loadDisableFlag(' TRUE ')).toBe(true);
  });
});
