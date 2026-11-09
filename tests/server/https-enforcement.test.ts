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
let appUrl = 'https://bugpin.example.com';
let portalBaseUrl = '';
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
  appUrl = 'https://bugpin.example.com';
  portalBaseUrl = '';
  config.trustProxy = 'auto';
  warnings = [];
  settingsCacheService.getAll = async () =>
    ({ enforceHttps, appUrl, portalBaseUrl }) as AppSettings;
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
      const response = await createApp().request(
        `http://${host}/health`,
        {},
        { requestIP: () => ({ address: '127.0.0.1' }) }
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('Location')).toBeNull();
    }
  });

  it.each([
    ['', 'http://bugpin.example.com/health?next=1', 'https://bugpin.example.com/health?next=1'],
    ['', 'http://bugpin.example.com:8080/health', 'https://bugpin.example.com:8080/health'],
    [
      'https://bugpin.example.com',
      'http://bugpin.example.com:8080/health',
      'https://bugpin.example.com/health',
    ],
    [
      'https://canonical.example.com:8443',
      'http://bugpin.example.com:8080/health?next=1',
      'https://canonical.example.com:8443/health?next=1',
    ],
    [
      'https://canonical.example.com:80',
      'http://bugpin.example.com:8080/health',
      'https://canonical.example.com:80/health',
    ],
  ])(
    'redirects single-origin HTTP with appUrl=%s and request=%s',
    async (configured, request, expected) => {
      appUrl = configured;
      const response = await createApp().request(request);
      expect(response.status).toBe(301);
      expect(response.headers.get('Location')).toBe(expected);
    }
  );

  it.each([
    ['', 'https://internal.example/health?next=1'],
    ['https://bugpin.example.com', 'https://bugpin.example.com/health?next=1'],
  ])(
    'ignores an unmatched forwarded redirect host in single-origin mode with appUrl=%s',
    async (configured, expected) => {
      appUrl = configured;
      const response = await createApp().request(
        'http://internal.example/health?next=1',
        {
          headers: { 'X-Forwarded-Host': 'attacker.example', 'X-Forwarded-Proto': 'http' },
        },
        { requestIP: () => ({ address: '127.0.0.1' }) }
      );
      expect(response.status).toBe(301);
      expect(response.headers.get('Location')).toBe(expected);
    }
  );

  it('uses the unforwarded Host header when the Application URL is empty', async () => {
    appUrl = '';
    const response = await createApp().request(
      'http://internal.example/health?next=1',
      {
        headers: {
          Host: 'request.example:8080',
          'X-Forwarded-Host': 'attacker.example',
          'X-Forwarded-Proto': 'http',
        },
      },
      { requestIP: () => ({ address: '127.0.0.1' }) }
    );
    expect(response.status).toBe(301);
    expect(response.headers.get('Location')).toBe('https://request.example:8080/health?next=1');
  });

  it.each([
    '',
    'bad host',
    'example.test/path',
    'person@example.test',
    'example.test,evil.test',
    'example.test:invalid',
    '[::1',
  ])('rejects malformed unforwarded Host %s with a controlled 400', async (host) => {
    appUrl = '';
    const response = await createApp().request(
      'http://internal.example/health',
      {
        headers: {
          Host: host,
          'X-Forwarded-Host': 'bugpin.example.com',
          'X-Forwarded-Proto': 'http',
        },
      },
      { requestIP: () => ({ address: '127.0.0.1' }) }
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: 'INVALID_HOST',
      message: 'Invalid host',
    });
    expect(response.headers.get('Location')).toBeNull();
  });

  it('uses the trusted forwarded protocol without redirecting an already secure single-origin request', async () => {
    appUrl = '';
    const response = await createApp().request(
      'http://internal.example/health',
      {
        headers: { 'X-Forwarded-Host': 'attacker.example', 'X-Forwarded-Proto': 'https' },
      },
      { requestIP: () => ({ address: '127.0.0.1' }) }
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Location')).toBeNull();
  });

  it('rejects an unconfigured forwarded host in separate-origin mode', async () => {
    portalBaseUrl = 'https://portal.example.com';
    const response = await createApp().request(
      'http://internal.example/health?next=1',
      {
        headers: { 'X-Forwarded-Host': 'attacker.example', 'X-Forwarded-Proto': 'http' },
      },
      { requestIP: () => ({ address: '127.0.0.1' }) }
    );
    expect(response.status).toBe(421);
    expect(response.headers.get('Location')).toBeNull();
  });

  it('does not exempt a forged loopback Host from a public peer in single-origin mode', async () => {
    const response = await createApp().request(
      'http://localhost/health',
      {},
      { requestIP: () => ({ address: '203.0.113.7' }) }
    );
    expect(response.status).toBe(301);
    expect(response.headers.get('Location')).toBe('https://bugpin.example.com/health');
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
