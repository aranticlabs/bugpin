import {
  WebAuthnError,
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { api } from '../api/client';
import type { User } from '@shared/types';

export function passkeysSupported(): boolean {
  return browserSupportsWebAuthn();
}

/** Readable message for a failed passkey prompt or a rejected server check */
export function passkeyErrorMessage(err: unknown, fallback: string): string {
  const serverMessage = (err as { response?: { data?: { message?: string } } }).response?.data
    ?.message;
  if (serverMessage) return serverMessage;
  if (err instanceof WebAuthnError) {
    if (err.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
      return 'This passkey is already registered';
    }
    return fallback;
  }
  // The browser reports a cancelled or timed-out prompt as NotAllowedError
  if (err instanceof Error && err.name === 'NotAllowedError') {
    return 'The passkey prompt was cancelled or timed out';
  }
  return fallback;
}

export async function signInWithPasskey(): Promise<User> {
  const { data } = await api.post<{
    challengeId: string;
    options: PublicKeyCredentialRequestOptionsJSON;
  }>('/auth/login/passkey/options');
  const response = await startAuthentication({ optionsJSON: data.options });
  const result = await api.post<{ user: User }>('/auth/login/passkey', {
    challengeId: data.challengeId,
    response,
  });
  return result.data.user;
}

export async function verifyPasskeySecondFactor(challengeToken: string): Promise<User> {
  const { data } = await api.post<{ options: PublicKeyCredentialRequestOptionsJSON }>(
    '/auth/login/two-factor/passkey/options',
    { challengeToken }
  );
  const response = await startAuthentication({ optionsJSON: data.options });
  const result = await api.post<{ user: User }>('/auth/login/two-factor/passkey', {
    challengeToken,
    response,
  });
  return result.data.user;
}

export async function registerPasskey(name: string): Promise<string[] | null> {
  const { data } = await api.post<{ options: PublicKeyCredentialCreationOptionsJSON }>(
    '/auth/passkeys/register/options'
  );
  const response = await startRegistration({ optionsJSON: data.options });
  const result = await api.post<{ recoveryCodes: string[] | null }>('/auth/passkeys/register', {
    response,
    name,
  });
  return result.data.recoveryCodes;
}
