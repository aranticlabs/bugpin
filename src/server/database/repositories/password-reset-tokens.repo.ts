import { getDb } from '../database.js';
import { generatePasswordResetTokenId } from '../../utils/id.js';
import type { IPasswordResetTokensRepository, PasswordResetToken } from './interfaces.js';

interface PasswordResetTokenRow {
  id: string;
  user_id: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

function mapRow(row: PasswordResetTokenRow): PasswordResetToken {
  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: row.expires_at,
    usedAt: row.used_at ?? undefined,
    createdAt: row.created_at,
  };
}

export const passwordResetTokensRepo: IPasswordResetTokensRepository = {
  async create(userId, tokenHash, expiresAt) {
    const db = getDb();
    const id = generatePasswordResetTokenId();
    const createdAt = new Date().toISOString();
    db.run(
      'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, userId, tokenHash, expiresAt, createdAt]
    );
    return { id, userId, expiresAt, createdAt };
  },

  async findValidByHash(tokenHash) {
    const db = getDb();
    const row = db
      .query(
        'SELECT id, user_id, expires_at, used_at, created_at FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?'
      )
      .get(tokenHash, new Date().toISOString()) as PasswordResetTokenRow | null;
    return row ? mapRow(row) : null;
  },

  async markUsed(id) {
    const db = getDb();
    const result = db.run(
      'UPDATE password_reset_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL',
      [new Date().toISOString(), id]
    );
    return result.changes > 0;
  },

  async deleteByUserId(userId) {
    const db = getDb();
    return db.run('DELETE FROM password_reset_tokens WHERE user_id = ?', [userId]).changes;
  },
};
