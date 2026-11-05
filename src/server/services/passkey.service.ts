import { randomBytes } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { isoBase64URL, isoUint8Array } from '@simplewebauthn/server/helpers';
import { twoFactorRepo, type PasskeyCredential } from '../database/repositories/two-factor.repo.js';
import { usersRepo } from '../database/repositories/users.repo.js';
import type { RelyingParty } from '../utils/relying-party.js';
import { twoFactorService } from './two-factor.service.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import type { User } from '@shared/types';

type ChallengePurpose = 'register' | 'login' | 'second-factor';

interface StoredChallenge {
  challenge: string;
  purpose: ChallengePurpose;
  userId?: string;
  expiresAt: number;
}

// WebAuthn challenges live in memory for a few minutes; BugPin runs as a single instance.
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const challenges = new Map<string, StoredChallenge>();

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, stored] of challenges) {
    if (stored.expiresAt < now) challenges.delete(key);
  }
}, 60_000);
cleanupInterval.unref?.();

function storeChallenge(key: string, value: Omit<StoredChallenge, 'expiresAt'>): void {
  challenges.set(key, { ...value, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

/** Read and remove a challenge, so every challenge is verified at most once */
function takeChallenge(key: string, purpose: ChallengePurpose): StoredChallenge | null {
  const stored = challenges.get(key);
  challenges.delete(key);
  if (!stored || stored.purpose !== purpose || stored.expiresAt < Date.now()) return null;
  return stored;
}

function toWebAuthnCredential(passkey: PasskeyCredential) {
  return {
    id: passkey.credentialId,
    publicKey: isoBase64URL.toBuffer(passkey.publicKey),
    counter: passkey.counter,
    transports: passkey.transports,
  };
}

async function verifyAssertion(
  rp: RelyingParty,
  expectedChallenge: string,
  response: AuthenticationResponseJSON
): Promise<PasskeyCredential | null> {
  const passkey = await twoFactorRepo.findPasskeyByCredentialId(response.id);
  if (!passkey) return null;
  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      credential: toWebAuthnCredential(passkey),
      requireUserVerification: true,
    });
    if (!verification.verified) return null;
    await twoFactorRepo.recordPasskeyUse(passkey.id, verification.authenticationInfo.newCounter);
    return passkey;
  } catch (error) {
    logger.warn('Passkey assertion rejected', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export const passkeyService = {
  // Registration (signed-in user)

  async registrationOptions(
    user: User,
    rp: RelyingParty
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const existing = await twoFactorRepo.listPasskeys(user.id);
    const options = await generateRegistrationOptions({
      rpName: rp.name,
      rpID: rp.id,
      userName: user.email,
      userDisplayName: user.name,
      userID: isoUint8Array.fromUTF8String(user.id),
      attestationType: 'none',
      excludeCredentials: existing.map((passkey) => ({
        id: passkey.credentialId,
        transports: passkey.transports,
      })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    storeChallenge(`register:${user.id}`, {
      challenge: options.challenge,
      purpose: 'register',
      userId: user.id,
    });
    return options;
  },

  /**
   * Store a new passkey. Returns recovery codes when this is the user's first second
   * factor, so they are shown exactly once.
   */
  async register(
    user: User,
    rp: RelyingParty,
    response: RegistrationResponseJSON,
    name: string
  ): Promise<Result<{ recoveryCodes: string[] | null }>> {
    const stored = takeChallenge(`register:${user.id}`, 'register');
    if (!stored) return Result.fail('The passkey request expired. Try again.', 'CHALLENGE_EXPIRED');

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: stored.challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.id,
        requireUserVerification: true,
      });
    } catch (error) {
      logger.warn('Passkey registration rejected', {
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return Result.fail('The passkey could not be verified', 'PASSKEY_INVALID');
    }
    if (!verification.verified) {
      return Result.fail('The passkey could not be verified', 'PASSKEY_INVALID');
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    if (await twoFactorRepo.findPasskeyByCredentialId(credential.id)) {
      return Result.fail('This passkey is already registered', 'PASSKEY_EXISTS');
    }
    await twoFactorRepo.createPasskey({
      userId: user.id,
      credentialId: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name: name.trim() || 'Passkey',
    });
    logger.info('Passkey added', { userId: user.id });
    return Result.ok({
      recoveryCodes: await twoFactorService.issueRecoveryCodesIfMissing(user.id),
    });
  },

  async rename(userId: string, passkeyId: string, name: string): Promise<Result<void>> {
    const renamed = await twoFactorRepo.renamePasskey(userId, passkeyId, name.trim());
    return renamed ? Result.ok(undefined) : Result.fail('Passkey not found', 'NOT_FOUND');
  },

  async remove(user: User, passkeyId: string, password: string): Promise<Result<void>> {
    if (!(await twoFactorService.verifyPassword(user.id, password))) {
      return Result.fail('Password is incorrect', 'INVALID_PASSWORD');
    }
    const allowed = await twoFactorService.ensureFactorCanBeRemoved(user, 'passkey');
    if (!allowed.success) return allowed;
    if (!(await twoFactorRepo.deletePasskey(user.id, passkeyId))) {
      return Result.fail('Passkey not found', 'NOT_FOUND');
    }
    await twoFactorService.dropRecoveryCodesIfUnused(user.id);
    logger.info('Passkey removed', { userId: user.id });
    return Result.ok(undefined);
  },

  // Passwordless sign-in (any passkey the browser offers)

  async loginOptions(
    rp: RelyingParty
  ): Promise<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }> {
    const options = await generateAuthenticationOptions({
      rpID: rp.id,
      userVerification: 'required',
    });
    const challengeId = randomBytes(24).toString('base64url');
    storeChallenge(`login:${challengeId}`, { challenge: options.challenge, purpose: 'login' });
    return { challengeId, options };
  },

  async login(
    rp: RelyingParty,
    challengeId: string,
    response: AuthenticationResponseJSON
  ): Promise<Result<User>> {
    const stored = takeChallenge(`login:${challengeId}`, 'login');
    if (!stored) return Result.fail('The sign-in request expired. Try again.', 'CHALLENGE_EXPIRED');
    const passkey = await verifyAssertion(rp, stored.challenge, response);
    if (!passkey) return Result.fail('The passkey could not be verified', 'PASSKEY_INVALID');
    const user = await usersRepo.findById(passkey.userId);
    if (!user || !user.isActive) return Result.fail('Account is disabled', 'ACCOUNT_DISABLED');
    return Result.ok(user);
  },

  // Second step after a password (only the pending user's passkeys)

  async secondFactorOptions(
    rp: RelyingParty,
    challengeToken: string,
    userId: string
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const passkeys = await twoFactorRepo.listPasskeys(userId);
    const options = await generateAuthenticationOptions({
      rpID: rp.id,
      userVerification: 'required',
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.credentialId,
        transports: passkey.transports,
      })),
    });
    storeChallenge(`second-factor:${challengeToken}`, {
      challenge: options.challenge,
      purpose: 'second-factor',
      userId,
    });
    return options;
  },

  async verifySecondFactor(
    rp: RelyingParty,
    challengeToken: string,
    response: AuthenticationResponseJSON
  ): Promise<boolean> {
    const stored = takeChallenge(`second-factor:${challengeToken}`, 'second-factor');
    if (!stored) return false;
    const passkey = await verifyAssertion(rp, stored.challenge, response);
    return !!passkey && passkey.userId === stored.userId;
  },

  clearChallenges(): void {
    challenges.clear();
  },
};
