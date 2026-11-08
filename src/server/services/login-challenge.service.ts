import { randomBytes } from 'node:crypto';

// Pending two-step logins live in memory: BugPin runs as a single instance, and a
// restart only means the user has to enter their password again.
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
// Per-account limit, so an attacker who knows the password cannot keep opening new
// challenges from many addresses to guess the second factor.
const ACCOUNT_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_ACCOUNT_FAILURES = 10;
const ACCOUNT_LOCK_MS = 15 * 60 * 1000;

export interface PendingLogin {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: number;
  failedAttempts: number;
}

export type AttemptResult =
  { ok: true; pending: PendingLogin } | { ok: false; reason: 'expired' | 'locked' };

interface AccountFailures {
  count: number;
  windowEndsAt: number;
  lockedUntil: number;
}

const pendingLogins = new Map<string, PendingLogin>();
const accountFailures = new Map<string, AccountFailures>();

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [token, pending] of pendingLogins) {
    if (pending.expiresAt < now) pendingLogins.delete(token);
  }
  for (const [userId, failures] of accountFailures) {
    if (failures.windowEndsAt < now && failures.lockedUntil < now) accountFailures.delete(userId);
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

  /**
   * Count a second-factor attempt before it is verified. Counting up front (synchronously)
   * means parallel requests on one challenge cannot all slip under the limits while the
   * first verification is still running.
   */
  beginAttempt(token: string, now = Date.now()): AttemptResult {
    const pending = this.get(token);
    if (!pending) return { ok: false, reason: 'expired' };
    if (pending.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      pendingLogins.delete(token);
      return { ok: false, reason: 'expired' };
    }

    let failures = accountFailures.get(pending.userId);
    if (failures && failures.lockedUntil > now) return { ok: false, reason: 'locked' };
    if (!failures || failures.windowEndsAt < now) {
      failures = { count: 0, windowEndsAt: now + ACCOUNT_FAILURE_WINDOW_MS, lockedUntil: 0 };
      accountFailures.set(pending.userId, failures);
    }
    if (failures.count >= MAX_ACCOUNT_FAILURES) {
      failures.lockedUntil = now + ACCOUNT_LOCK_MS;
      return { ok: false, reason: 'locked' };
    }

    pending.failedAttempts += 1;
    failures.count += 1;
    return { ok: true, pending };
  },

  /** A rejected attempt was already counted; drop the challenge once it is used up */
  recordFailure(token: string): void {
    const pending = pendingLogins.get(token);
    if (pending && pending.failedAttempts >= MAX_FAILED_ATTEMPTS) pendingLogins.delete(token);
  },

  /** A verified second factor clears the account's failure count */
  recordSuccess(userId: string): void {
    accountFailures.delete(userId);
  },

  consume(token: string): void {
    pendingLogins.delete(token);
  },

  clear(): void {
    pendingLogins.clear();
    accountFailures.clear();
  },
};
