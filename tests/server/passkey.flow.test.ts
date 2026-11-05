import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'crypto';
import { config } from '../../src/server/config';
import {
  closeDatabase,
  initDatabase,
  initSchema,
  runMigrations,
} from '../../src/server/database/database';
import { usersRepo } from '../../src/server/database/repositories/users.repo';
import { settingsRepo } from '../../src/server/database/repositories/settings.repo';
import { twoFactorRepo } from '../../src/server/database/repositories/two-factor.repo';
import { settingsCacheService } from '../../src/server/services/settings-cache.service';
import { authService } from '../../src/server/services/auth.service';
import { passkeyService } from '../../src/server/services/passkey.service';
import { loginChallengeService } from '../../src/server/services/login-challenge.service';
import { logger } from '../../src/server/utils/logger';
import type { RelyingParty } from '../../src/server/utils/relying-party';
import type { User } from '../../src/shared/types';

// Minimal CBOR encoder for the structures an authenticator emits

type CborValue = number | string | Uint8Array | Map<number | string, CborValue>;

function cborHead(major: number, length: number): number[] {
  if (length < 24) return [(major << 5) | length];
  if (length < 0x100) return [(major << 5) | 24, length];
  return [(major << 5) | 25, length >> 8, length & 0xff];
}

function cbor(value: CborValue): Uint8Array {
  if (typeof value === 'number') {
    return Uint8Array.from(value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value));
  }
  if (typeof value === 'string') {
    const bytes = new TextEncoder().encode(value);
    return Uint8Array.from([...cborHead(3, bytes.length), ...bytes]);
  }
  if (value instanceof Uint8Array) return Uint8Array.from([...cborHead(2, value.length), ...value]);
  const parts: number[] = cborHead(5, value.size);
  for (const [key, item] of value) parts.push(...cbor(key), ...cbor(item));
  return Uint8Array.from(parts);
}

const b64url = (bytes: Uint8Array | Buffer) => Buffer.from(bytes).toString('base64url');
const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest();

/** A platform authenticator in software: one ES256 key pair per credential */
class SoftAuthenticator {
  readonly credentialId = randomBytes(16);
  private readonly privateKey: KeyObject;
  private readonly publicJwk: { x: string; y: string };
  private counter = 0;

  constructor() {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.privateKey = privateKey;
    this.publicJwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  }

  get id(): string {
    return b64url(this.credentialId);
  }

  private authData(rp: RelyingParty, flags: number, attested?: Uint8Array): Buffer {
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.counter);
    return Buffer.concat([
      sha256(rp.id),
      Buffer.from([flags]),
      counter,
      attested ?? Buffer.alloc(0),
    ]);
  }

  register(rp: RelyingParty, challenge: string) {
    const coseKey = new Map<number, CborValue>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(this.publicJwk.x, 'base64url')],
      [-3, Buffer.from(this.publicJwk.y, 'base64url')],
    ]);
    const idLength = Buffer.alloc(2);
    idLength.writeUInt16BE(this.credentialId.length);
    const attested = Buffer.concat([Buffer.alloc(16), idLength, this.credentialId, cbor(coseKey)]);
    // User present, user verified, attested credential data
    const authData = this.authData(rp, 0x01 | 0x04 | 0x40, attested);
    const clientDataJSON = JSON.stringify({
      type: 'webauthn.create',
      challenge,
      origin: rp.origin,
      crossOrigin: false,
    });
    const attestationObject = cbor(
      new Map<string, CborValue>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ])
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      response: {
        clientDataJSON: b64url(Buffer.from(clientDataJSON)),
        attestationObject: b64url(attestationObject),
        transports: ['internal' as const],
      },
      clientExtensionResults: {},
    };
  }

  assert(rp: RelyingParty, challenge: string, options: { userVerified?: boolean } = {}) {
    this.counter += 1;
    const authData = this.authData(rp, 0x01 | (options.userVerified === false ? 0 : 0x04));
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: 'webauthn.get', challenge, origin: rp.origin, crossOrigin: false })
    );
    const signature = sign(
      'sha256',
      Buffer.concat([authData, sha256(clientDataJSON)]),
      this.privateKey
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      response: {
        clientDataJSON: b64url(clientDataJSON),
        authenticatorData: b64url(authData),
        signature: b64url(signature),
      },
      clientExtensionResults: {},
    };
  }
}

const rp: RelyingParty = {
  name: 'BugPin',
  origin: 'https://bugs.example.test',
  id: 'bugs.example.test',
};
const originalConfig = { ...config };
const originalLogger = { ...logger };
const password = 'initial-password-1';
let tempDir = '';
let user: User;

async function setPolicy(twoFactorPolicy: 'off' | 'admins' | 'everyone') {
  await settingsRepo.updateAll({ twoFactorPolicy });
  settingsCacheService.invalidate();
}

async function addPasskey(target: User, authenticator = new SoftAuthenticator()) {
  const options = await passkeyService.registrationOptions(target, rp);
  const result = await passkeyService.register(
    target,
    rp,
    authenticator.register(rp, options.challenge),
    'Laptop'
  );
  if (!result.success) throw new Error(result.error);
  return { authenticator, recoveryCodes: result.value.recoveryCodes };
}

beforeAll(async () => {
  logger.info = () => undefined;
  logger.warn = () => undefined;
  tempDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-passkey-'));
  Object.assign(config, { dataDir: tempDir, dbPath: path.join(tempDir, 'bugpin.db') });
  await initDatabase();
  await initSchema();
  await runMigrations();
});

afterAll(() => {
  closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
  Object.assign(config, originalConfig);
  Object.assign(logger, originalLogger);
});

beforeEach(async () => {
  loginChallengeService.clear();
  passkeyService.clearChallenges();
  await setPolicy('off');
  user = await usersRepo.create({
    email: `user-${crypto.randomUUID()}@example.test`,
    passwordHash: await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 4 }),
    name: 'User',
    role: 'admin',
  });
});

describe('passkey registration', () => {
  it('stores the passkey and issues recovery codes for the first factor only', async () => {
    const first = await addPasskey(user);
    expect(first.recoveryCodes).toHaveLength(10);
    const second = await addPasskey(user);
    expect(second.recoveryCodes).toBeNull();

    const stored = await twoFactorRepo.listPasskeys(user.id);
    expect(stored.map((passkey) => passkey.credentialId)).toEqual([
      first.authenticator.id,
      second.authenticator.id,
    ]);
    expect(stored[0].name).toBe('Laptop');
  });

  it('excludes already registered credentials from new registration options', async () => {
    const { authenticator } = await addPasskey(user);
    const options = await passkeyService.registrationOptions(user, rp);
    expect(options.excludeCredentials?.map((credential) => credential.id)).toEqual([
      authenticator.id,
    ]);
    expect(options.authenticatorSelection?.userVerification).toBe('required');
    expect(options.rp.id).toBe(rp.id);
  });

  it('rejects a response for a different origin', async () => {
    const options = await passkeyService.registrationOptions(user, rp);
    const foreign = { ...rp, origin: 'https://evil.example.test', id: 'evil.example.test' };
    const result = await passkeyService.register(
      user,
      rp,
      new SoftAuthenticator().register(foreign, options.challenge),
      'Laptop'
    );
    expect(result.success).toBe(false);
    expect(await twoFactorRepo.countPasskeys(user.id)).toBe(0);
  });

  it('accepts a registration challenge only once', async () => {
    const authenticator = new SoftAuthenticator();
    const options = await passkeyService.registrationOptions(user, rp);
    const response = authenticator.register(rp, options.challenge);
    expect((await passkeyService.register(user, rp, response, 'Laptop')).success).toBe(true);
    const replay = await passkeyService.register(user, rp, response, 'Laptop');
    expect(replay.success).toBe(false);
    if (!replay.success) expect(replay.code).toBe('CHALLENGE_EXPIRED');
  });
});

describe('passwordless sign-in', () => {
  it('signs in with a registered passkey and records its use', async () => {
    const { authenticator } = await addPasskey(user);
    const { challengeId, options } = await passkeyService.loginOptions(rp);
    const result = await authService.loginWithPasskey(
      rp,
      challengeId,
      authenticator.assert(rp, options.challenge)
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.user.id).toBe(user.id);
      expect(result.value.user.twoFactorEnabled).toBe(true);
    }
    const [stored] = await twoFactorRepo.listPasskeys(user.id);
    expect(stored.counter).toBe(1);
    expect(stored.lastUsedAt).toBeDefined();
  });

  it('rejects a replayed assertion', async () => {
    const { authenticator } = await addPasskey(user);
    const { challengeId, options } = await passkeyService.loginOptions(rp);
    const assertion = authenticator.assert(rp, options.challenge);
    expect((await authService.loginWithPasskey(rp, challengeId, assertion)).success).toBe(true);
    expect((await authService.loginWithPasskey(rp, challengeId, assertion)).success).toBe(false);
  });

  it('requires user verification', async () => {
    const { authenticator } = await addPasskey(user);
    const { challengeId, options } = await passkeyService.loginOptions(rp);
    const result = await authService.loginWithPasskey(
      rp,
      challengeId,
      authenticator.assert(rp, options.challenge, { userVerified: false })
    );
    expect(result.success).toBe(false);
  });

  it('rejects an unknown credential', async () => {
    const { challengeId, options } = await passkeyService.loginOptions(rp);
    const result = await authService.loginWithPasskey(
      rp,
      challengeId,
      new SoftAuthenticator().assert(rp, options.challenge)
    );
    expect(result.success).toBe(false);
  });

  it('refuses a deactivated account', async () => {
    const { authenticator } = await addPasskey(user);
    await usersRepo.update(user.id, { isActive: false });
    const { challengeId, options } = await passkeyService.loginOptions(rp);
    const result = await authService.loginWithPasskey(
      rp,
      challengeId,
      authenticator.assert(rp, options.challenge)
    );
    expect(result.success).toBe(false);
  });
});

describe('passkey as second factor', () => {
  async function startPasswordLogin(): Promise<string> {
    const result = await authService.login(user.email, password);
    if (!result.success || !('twoFactorRequired' in result.value)) {
      throw new Error('Expected a second-factor challenge');
    }
    expect(result.value.methods.passkey).toBe(true);
    return result.value.challengeToken;
  }

  it('completes the password login with a passkey', async () => {
    const { authenticator } = await addPasskey(user);
    const token = await startPasswordLogin();
    const options = await authService.passkeySecondFactorOptions(rp, token);
    if (!options.success) throw new Error(options.error);
    expect(options.value.allowCredentials?.map((credential) => credential.id)).toEqual([
      authenticator.id,
    ]);

    const result = await authService.completePasskeySecondFactor(
      rp,
      token,
      authenticator.assert(rp, options.value.challenge)
    );
    expect(result.success).toBe(true);
    expect(loginChallengeService.get(token)).toBeNull();
  });

  it("rejects another user's passkey", async () => {
    await addPasskey(user);
    const other = await usersRepo.create({
      email: `other-${crypto.randomUUID()}@example.test`,
      passwordHash: await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 4 }),
      name: 'Other',
      role: 'viewer',
    });
    const { authenticator: otherKey } = await addPasskey(other);

    const token = await startPasswordLogin();
    const options = await authService.passkeySecondFactorOptions(rp, token);
    if (!options.success) throw new Error(options.error);
    const result = await authService.completePasskeySecondFactor(
      rp,
      token,
      otherKey.assert(rp, options.value.challenge)
    );
    expect(result.success).toBe(false);
    expect(loginChallengeService.get(token)?.failedAttempts).toBe(1);
  });

  it('needs a pending password login', async () => {
    const result = await authService.passkeySecondFactorOptions(rp, 'unknown-token');
    expect(result.success).toBe(false);
  });
});

describe('passkey management', () => {
  it("renames only the owner's passkey", async () => {
    await addPasskey(user);
    const [stored] = await twoFactorRepo.listPasskeys(user.id);
    expect((await passkeyService.rename('someone-else', stored.id, 'Phone')).success).toBe(false);
    expect((await passkeyService.rename(user.id, stored.id, '  Phone  ')).success).toBe(true);
    expect((await twoFactorRepo.listPasskeys(user.id))[0].name).toBe('Phone');
  });

  it('removes a passkey with the password and drops recovery codes with the last factor', async () => {
    await addPasskey(user);
    const [stored] = await twoFactorRepo.listPasskeys(user.id);
    expect((await passkeyService.remove(user, stored.id, 'wrong-password')).success).toBe(false);
    expect((await passkeyService.remove(user, stored.id, password)).success).toBe(true);
    expect(await twoFactorRepo.countPasskeys(user.id)).toBe(0);
    expect(await twoFactorRepo.countUnusedRecoveryCodes(user.id)).toBe(0);
  });

  it('keeps the last passkey while the policy requires a second factor', async () => {
    await addPasskey(user);
    await setPolicy('admins');
    const [stored] = await twoFactorRepo.listPasskeys(user.id);
    const result = await passkeyService.remove(user, stored.id, password);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('TWO_FACTOR_REQUIRED');
  });
});
