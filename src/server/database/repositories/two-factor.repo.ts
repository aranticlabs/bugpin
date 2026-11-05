import { getDb, transaction } from '../database.js';
import { generateId } from '../../utils/id.js';
import type { Passkey } from '@shared/types';

// Database Row Types

interface TotpRow {
  user_id: string;
  secret_encrypted: string;
  confirmed_at: string | null;
  last_used_step: number | null;
}

interface PasskeyRow {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
  device_type: string | null;
  backed_up: number;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export interface TotpRecord {
  userId: string;
  secretEncrypted: string;
  confirmedAt: string | null;
  lastUsedStep: number | null;
}

export interface PasskeyCredential extends Passkey {
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
}

export interface CreatePasskeyData {
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  deviceType?: string;
  backedUp: boolean;
  name: string;
}

function mapPasskey(row: PasskeyRow): PasskeyCredential {
  return {
    id: row.id,
    userId: row.user_id,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: row.counter,
    transports: row.transports ? (JSON.parse(row.transports) as string[]) : [],
    name: row.name,
    backedUp: row.backed_up === 1,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? undefined,
  };
}

// Repository

export const twoFactorRepo = {
  // Authenticator app (TOTP)

  async getTotp(userId: string): Promise<TotpRecord | null> {
    const row = getDb()
      .query('SELECT * FROM user_totp WHERE user_id = ?')
      .get(userId) as TotpRow | null;
    if (!row) return null;
    return {
      userId: row.user_id,
      secretEncrypted: row.secret_encrypted,
      confirmedAt: row.confirmed_at,
      lastUsedStep: row.last_used_step,
    };
  },

  /** Store a new, unconfirmed secret. A confirmed secret is never replaced here. */
  async savePendingTotp(userId: string, secretEncrypted: string): Promise<boolean> {
    const result = getDb().run(
      `INSERT INTO user_totp (user_id, secret_encrypted, confirmed_at, last_used_step, created_at)
       VALUES (?, ?, NULL, NULL, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         secret_encrypted = excluded.secret_encrypted,
         last_used_step = NULL,
         created_at = excluded.created_at
       WHERE user_totp.confirmed_at IS NULL`,
      [userId, secretEncrypted, new Date().toISOString()]
    );
    return result.changes > 0;
  },

  async confirmTotp(userId: string, step: number): Promise<boolean> {
    const result = getDb().run(
      `UPDATE user_totp SET confirmed_at = ?, last_used_step = ?
       WHERE user_id = ? AND confirmed_at IS NULL`,
      [new Date().toISOString(), step, userId]
    );
    return result.changes > 0;
  },

  /**
   * Record a used time step. Fails when the step is not newer than the last one,
   * which rejects a code that was already used.
   */
  async markTotpStepUsed(userId: string, step: number): Promise<boolean> {
    const result = getDb().run(
      `UPDATE user_totp SET last_used_step = ?
       WHERE user_id = ? AND confirmed_at IS NOT NULL
         AND (last_used_step IS NULL OR last_used_step < ?)`,
      [step, userId, step]
    );
    return result.changes > 0;
  },

  async deleteTotp(userId: string): Promise<void> {
    getDb().run('DELETE FROM user_totp WHERE user_id = ?', [userId]);
  },

  // Recovery codes

  async replaceRecoveryCodes(userId: string, codeHashes: string[]): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();
    transaction(() => {
      db.run('DELETE FROM user_recovery_codes WHERE user_id = ?', [userId]);
      for (const hash of codeHashes) {
        db.run(
          'INSERT INTO user_recovery_codes (id, user_id, code_hash, created_at) VALUES (?, ?, ?, ?)',
          [generateId('rec'), userId, hash, now]
        );
      }
    });
  },

  async countUnusedRecoveryCodes(userId: string): Promise<number> {
    const row = getDb()
      .query(
        'SELECT COUNT(*) AS count FROM user_recovery_codes WHERE user_id = ? AND used_at IS NULL'
      )
      .get(userId) as { count: number };
    return row.count;
  },

  /** Mark a code as used. Returns false when it does not exist or was already used. */
  async consumeRecoveryCode(userId: string, codeHash: string): Promise<boolean> {
    const result = getDb().run(
      `UPDATE user_recovery_codes SET used_at = ?
       WHERE user_id = ? AND code_hash = ? AND used_at IS NULL`,
      [new Date().toISOString(), userId, codeHash]
    );
    return result.changes > 0;
  },

  async deleteRecoveryCodes(userId: string): Promise<void> {
    getDb().run('DELETE FROM user_recovery_codes WHERE user_id = ?', [userId]);
  },

  // Passkeys

  async listPasskeys(userId: string): Promise<PasskeyCredential[]> {
    const rows = getDb()
      .query('SELECT * FROM user_passkeys WHERE user_id = ? ORDER BY created_at ASC')
      .all(userId) as PasskeyRow[];
    return rows.map(mapPasskey);
  },

  async countPasskeys(userId: string): Promise<number> {
    const row = getDb()
      .query('SELECT COUNT(*) AS count FROM user_passkeys WHERE user_id = ?')
      .get(userId) as { count: number };
    return row.count;
  },

  async findPasskeyByCredentialId(credentialId: string): Promise<PasskeyCredential | null> {
    const row = getDb()
      .query('SELECT * FROM user_passkeys WHERE credential_id = ?')
      .get(credentialId) as PasskeyRow | null;
    return row ? mapPasskey(row) : null;
  },

  async createPasskey(data: CreatePasskeyData): Promise<PasskeyCredential> {
    const id = generateId('pk');
    getDb().run(
      `INSERT INTO user_passkeys
         (id, user_id, credential_id, public_key, counter, transports, device_type, backed_up, name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.userId,
        data.credentialId,
        data.publicKey,
        data.counter,
        JSON.stringify(data.transports),
        data.deviceType ?? null,
        data.backedUp ? 1 : 0,
        data.name,
        new Date().toISOString(),
      ]
    );
    const created = await this.findPasskeyByCredentialId(data.credentialId);
    if (!created) throw new Error('Failed to create passkey');
    return created;
  },

  async recordPasskeyUse(id: string, counter: number): Promise<void> {
    getDb().run('UPDATE user_passkeys SET counter = ?, last_used_at = ? WHERE id = ?', [
      counter,
      new Date().toISOString(),
      id,
    ]);
  },

  async renamePasskey(userId: string, id: string, name: string): Promise<boolean> {
    const result = getDb().run('UPDATE user_passkeys SET name = ? WHERE id = ? AND user_id = ?', [
      name,
      id,
      userId,
    ]);
    return result.changes > 0;
  },

  async deletePasskey(userId: string, id: string): Promise<boolean> {
    const result = getDb().run('DELETE FROM user_passkeys WHERE id = ? AND user_id = ?', [
      id,
      userId,
    ]);
    return result.changes > 0;
  },

  // Aggregates

  /** Users with at least one active second factor (confirmed authenticator app or passkey) */
  async listUserIdsWithTwoFactor(): Promise<Set<string>> {
    const rows = getDb()
      .query(
        `SELECT user_id FROM user_totp WHERE confirmed_at IS NOT NULL
         UNION SELECT user_id FROM user_passkeys`
      )
      .all() as { user_id: string }[];
    return new Set(rows.map((row) => row.user_id));
  },

  /** Remove every second factor of a user (admin or operator reset) */
  async resetUser(userId: string): Promise<void> {
    const db = getDb();
    transaction(() => {
      db.run('DELETE FROM user_totp WHERE user_id = ?', [userId]);
      db.run('DELETE FROM user_recovery_codes WHERE user_id = ?', [userId]);
      db.run('DELETE FROM user_passkeys WHERE user_id = ?', [userId]);
    });
  },
};
