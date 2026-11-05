import { randomBytes } from 'node:crypto';

// Pending two-step logins live in memory: BugPin runs as a single instance, and a
// restart only means the user has to enter their password again.
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

export interface PendingLogin {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: number;
  failedAttempts: number;
}

const pendingLogins = new Map<string, PendingLogin>();

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [token, pending] of pendingLogins) {
    if (pending.expiresAt < now) pendingLogins.delete(token);
  }
}, 60_000);
cleanupInterval.unref?.();

export const loginChallengeService = {
  create(userId: string, meta: { ipAddress?: string; userAgent?: string } = {}): string {
    const token = randomBytes(32).toString('base64url');
    pendingLogins.set(token, {
      userId,
      ...meta,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
      failedAttempts: 0,
    });
    return token;
  },

  get(token: string): PendingLogin | null {
    const pending = pendingLogins.get(token);
    if (!pending) return null;
    if (pending.expiresAt < Date.now()) {
      pendingLogins.delete(token);
      return null;
    }
    return pending;
  },

  /** Count a wrong code; the challenge is discarded after too many attempts */
  recordFailure(token: string): void {
    const pending = pendingLogins.get(token);
    if (!pending) return;
    pending.failedAttempts += 1;
    if (pending.failedAttempts >= MAX_FAILED_ATTEMPTS) pendingLogins.delete(token);
  },

  consume(token: string): void {
    pendingLogins.delete(token);
  },

  clear(): void {
    pendingLogins.clear();
  },
};
