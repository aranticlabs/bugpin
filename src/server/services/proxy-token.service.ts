import { timingSafeEqual } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { Result } from '../utils/result.js';
import { generateSecureToken } from '../utils/secure-token.js';

let currentToken: string | undefined;
let exportStale = false;
const EXPORT_WARNING =
  'The token changed, but its shared file could not be updated. Copy this token into BUGPIN_PROXY_TOKEN for each frontend, or repair the shared volume and restart the server.';

function stageToken(file: string, token: string, mode: number): string {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, token, { mode, flag: 'wx' });
    chmodSync(temporary, mode);
    return temporary;
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

function writeToken(file: string, token: string, mode: number): void {
  const temporary = stageToken(file, token, mode);
  try {
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function publishToken(token: string): void {
  if (config.proxyTokenFile) {
    // The shared volume is read-only in frontends, whose UID differs from the server's.
    writeToken(config.proxyTokenFile, token, 0o644);
  }
}

export const proxyTokenService = {
  initialize(): Result<void> {
    if (config.trustProxy !== 'token') {
      currentToken = undefined;
      exportStale = false;
      return Result.ok(undefined);
    }
    try {
      const file = join(config.dataDir, '.proxy-token');
      if (existsSync(file)) {
        const token = readFileSync(file, 'utf8').trim();
        if (!/^[A-Za-z0-9_-]{43}$/.test(token))
          return Result.fail('Invalid stored proxy token', 'PROXY_TOKEN_ERROR');
        chmodSync(file, 0o600);
        currentToken = token;
      } else {
        const token = generateSecureToken();
        writeToken(file, token, 0o600);
        currentToken = token;
      }
      publishToken(currentToken);
      exportStale = false;
      return Result.ok(undefined);
    } catch (error) {
      logger.error('Failed to initialize proxy token', error);
      return Result.fail('Failed to initialize proxy token', 'PROXY_TOKEN_ERROR');
    }
  },

  get(): Result<string> {
    return currentToken
      ? Result.ok(currentToken)
      : Result.fail('Proxy token is not initialized', 'PROXY_TOKEN_ERROR');
  },

  getStatus(): Result<{ token: string; warning?: string }> {
    const result = this.get();
    if (!result.success) return result;
    return Result.ok({ token: result.value, ...(exportStale ? { warning: EXPORT_WARNING } : {}) });
  },

  regenerate(): Result<{ token: string; warning?: string }> {
    let privateFile: string | undefined;
    let exportedFile: string | undefined;
    try {
      const token = generateSecureToken();
      const file = join(config.dataDir, '.proxy-token');
      privateFile = stageToken(file, token, 0o600);
      if (config.proxyTokenFile) exportedFile = stageToken(config.proxyTokenFile, token, 0o644);
      renameSync(privateFile, file);
      currentToken = token;
      if (config.proxyTokenFile && exportedFile) {
        try {
          renameSync(exportedFile, config.proxyTokenFile);
        } catch (error) {
          logger.error('Failed to publish regenerated proxy token', error);
          exportStale = true;
          return Result.ok({ token, warning: EXPORT_WARNING });
        }
      }
      exportStale = false;
      return Result.ok({ token });
    } catch (error) {
      logger.error('Failed to regenerate proxy token', error);
      return Result.fail('Failed to regenerate or publish proxy token', 'PROXY_TOKEN_ERROR');
    } finally {
      for (const temporary of [privateFile, exportedFile]) {
        if (!temporary) continue;
        try {
          rmSync(temporary, { force: true });
        } catch (error) {
          logger.error('Failed to remove staged proxy token file', error);
        }
      }
    }
  },

  verify(token: string | undefined): Result<boolean> {
    if (!currentToken || !token) return Result.ok(false);
    const supplied = Buffer.from(token);
    const expected = Buffer.from(currentToken);
    return Result.ok(supplied.length === expected.length && timingSafeEqual(supplied, expected));
  },
};
