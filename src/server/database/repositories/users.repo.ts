import { getDb } from '../database.js';
import { generateUserId } from '../../utils/id.js';
import type {
  CreateUserData,
  CreateInvitedUserData,
  UserWithPassword,
  UserWithInvitationToken,
} from './interfaces.js';
import type { User, UserRole } from '@shared/types';

// Database Row Type

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  avatar_url: string | null;
  role: UserRole;
  is_active: number;
  must_change_password: number;
  api_access_enabled: number;
  gamification_enabled: number;
  password_changed_at: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  invitation_token: string | null;
  invitation_token_expires_at: string | null;
  invitation_sent_at: string | null;
  invitation_accepted_at: string | null;
}

// Row to Entity Mapping

function mapRowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url ?? undefined,
    role: row.role,
    isActive: row.is_active === 1,
    mustChangePassword: row.must_change_password === 1,
    apiAccessEnabled: row.api_access_enabled === 1,
    gamificationEnabled: row.gamification_enabled !== 0,
    passwordChangedAt: row.password_changed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at ?? undefined,
    invitationSentAt: row.invitation_sent_at ?? undefined,
    invitationAcceptedAt: row.invitation_accepted_at ?? undefined,
  };
}

function mapRowToUserWithPassword(row: UserRow): UserWithPassword {
  return {
    ...mapRowToUser(row),
    passwordHash: row.password_hash,
  };
}

function mapRowToUserWithInvitationToken(row: UserRow): UserWithInvitationToken {
  return {
    ...mapRowToUser(row),
    invitationToken: row.invitation_token,
    invitationTokenExpiresAt: row.invitation_token_expires_at,
  };
}

// Repository

export { CreateUserData, CreateInvitedUserData, UserWithPassword, UserWithInvitationToken };

export const usersRepo = {
  /**
   * Create a new user
   */
  async create(data: CreateUserData): Promise<User> {
    const db = getDb();
    const id = generateUserId();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO users (id, email, password_hash, name, avatar_url, role, is_active, must_change_password, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.email.toLowerCase(),
        data.passwordHash,
        data.name,
        data.avatarUrl ?? null,
        data.role ?? 'viewer',
        1,
        data.mustChangePassword ? 1 : 0,
        now,
        now,
      ]
    );

    const user = await this.findById(id);
    if (!user) {
      throw new Error('Failed to create user');
    }
    return user;
  },

  /**
   * Find a user by ID
   */
  async findById(id: string): Promise<User | null> {
    const db = getDb();
    const row = db.query('SELECT * FROM users WHERE id = ?').get(id) as UserRow | null;
    return row ? mapRowToUser(row) : null;
  },

  /**
   * Find a user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const db = getDb();
    const row = db
      .query('SELECT * FROM users WHERE email = ?')
      .get(email.toLowerCase()) as UserRow | null;
    return row ? mapRowToUser(row) : null;
  },

  /**
   * Find a user by email with password hash
   */
  async findByEmailWithPassword(email: string): Promise<UserWithPassword | null> {
    const db = getDb();
    const row = db
      .query('SELECT * FROM users WHERE email = ?')
      .get(email.toLowerCase()) as UserRow | null;
    return row ? mapRowToUserWithPassword(row) : null;
  },

  /**
   * Find all users
   */
  async findAll(): Promise<User[]> {
    const db = getDb();
    const rows = db.query('SELECT * FROM users ORDER BY created_at DESC').all() as UserRow[];
    return rows.map(mapRowToUser);
  },

  /**
   * Find users that can be assigned to reports
   */
  async findAssignable(): Promise<User[]> {
    const db = getDb();
    const rows = db
      .query(
        `SELECT * FROM users
         WHERE is_active = 1
           AND (invitation_sent_at IS NULL OR invitation_accepted_at IS NOT NULL)
         ORDER BY name ASC`
      )
      .all() as UserRow[];
    return rows.map(mapRowToUser);
  },

  /**
   * Find users by role
   */
  async findByRole(role: UserRole): Promise<User[]> {
    const db = getDb();
    const rows = db
      .query('SELECT * FROM users WHERE role = ? ORDER BY name ASC')
      .all(role) as UserRow[];
    return rows.map(mapRowToUser);
  },

  /**
   * Count admins who can sign in (active, not waiting on an invitation), leaving one user out
   */
  async countSignInAdminsExcept(excludeId: string): Promise<number> {
    const db = getDb();
    const result = db
      .query(
        `SELECT COUNT(*) as count FROM users
         WHERE role = 'admin'
           AND is_active = 1
           AND (invitation_sent_at IS NULL OR invitation_accepted_at IS NOT NULL)
           AND id != ?`
      )
      .get(excludeId) as { count: number };
    return result.count;
  },

  /**
   * Find a user's password hash
   */
  async findPasswordHash(id: string): Promise<string | null> {
    const db = getDb();
    const row = db.query('SELECT password_hash FROM users WHERE id = ?').get(id) as {
      password_hash: string;
    } | null;
    return row ? row.password_hash : null;
  },

  /**
   * Update a user
   */
  async update(
    id: string,
    updates: Partial<Pick<User, 'name' | 'email' | 'avatarUrl' | 'role' | 'isActive'>>
  ): Promise<User | null> {
    const db = getDb();
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [now];

    if (updates.name !== undefined) {
      sets.push('name = ?');
      params.push(updates.name);
    }

    if (updates.email !== undefined) {
      sets.push('email = ?');
      params.push(updates.email.toLowerCase());
    }

    if (updates.avatarUrl !== undefined) {
      sets.push('avatar_url = ?');
      params.push(updates.avatarUrl ?? '');
    }

    if (updates.role !== undefined) {
      sets.push('role = ?');
      params.push(updates.role);
    }

    if (updates.isActive !== undefined) {
      sets.push('is_active = ?');
      params.push(updates.isActive ? 1 : 0);
    }

    params.push(id);

    db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);

    return this.findById(id);
  },

  /**
   * Update user password
   */
  async updatePassword(id: string, passwordHash: string): Promise<boolean> {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.run(
      'UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = ?, updated_at = ? WHERE id = ?',
      [passwordHash, now, now, id]
    );
    return result.changes > 0;
  },

  /**
   * Require (or stop requiring) a password change before the user can use the API
   */
  async setMustChangePassword(id: string, mustChangePassword: boolean): Promise<void> {
    const db = getDb();
    db.run('UPDATE users SET must_change_password = ?, updated_at = ? WHERE id = ?', [
      mustChangePassword ? 1 : 0,
      new Date().toISOString(),
      id,
    ]);
  },

  async setApiAccess(id: string, enabled: boolean): Promise<void> {
    const db = getDb();
    db.run('UPDATE users SET api_access_enabled = ?, updated_at = ? WHERE id = ?', [
      enabled ? 1 : 0,
      new Date().toISOString(),
      id,
    ]);
  },

  setGamification(ids: string[], enabled: boolean): void {
    if (ids.length === 0) return;
    const db = getDb();
    const now = new Date().toISOString();
    const statement = db.prepare(
      'UPDATE users SET gamification_enabled = ?, updated_at = ? WHERE id = ?'
    );
    db.transaction(() => {
      for (const id of ids) statement.run(enabled ? 1 : 0, now, id);
    })();
  },

  /**
   * Update last login timestamp
   */
  async updateLastLogin(id: string): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();
    db.run('UPDATE users SET last_login_at = ? WHERE id = ?', [now, id]);
  },

  /**
   * Update user's avatar URL
   */
  async updateAvatarUrl(id: string, avatarUrl: string | null): Promise<User | null> {
    const db = getDb();
    const now = new Date().toISOString();
    db.run('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?', [avatarUrl, now, id]);
    return this.findById(id);
  },

  /**
   * Delete a user
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = db.run('DELETE FROM users WHERE id = ?', [id]);
    return result.changes > 0;
  },

  /**
   * Count all users
   */
  async count(): Promise<number> {
    const db = getDb();
    const result = db.query('SELECT COUNT(*) as count FROM users').get() as { count: number };
    return result.count;
  },

  /**
   * Check if email is already taken
   */
  async emailExists(email: string, excludeId?: string): Promise<boolean> {
    const db = getDb();
    const query = excludeId
      ? 'SELECT COUNT(*) as count FROM users WHERE email = ? AND id != ?'
      : 'SELECT COUNT(*) as count FROM users WHERE email = ?';
    const params = excludeId ? [email.toLowerCase(), excludeId] : [email.toLowerCase()];
    const result = db.query(query).get(...params) as { count: number };
    return result.count > 0;
  },

  /**
   * Create an invited user (no password, with invitation token)
   */
  async createInvited(data: CreateInvitedUserData): Promise<User> {
    const db = getDb();
    const id = generateUserId();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO users (id, email, password_hash, name, role, is_active, invitation_token, invitation_token_expires_at, invitation_sent_at, created_at, updated_at)
       VALUES (?, ?, '', ?, ?, 0, ?, ?, ?, ?, ?)`,
      [
        id,
        data.email.toLowerCase(),
        data.name,
        data.role ?? 'viewer',
        data.invitationToken,
        data.invitationTokenExpiresAt,
        now,
        now,
        now,
      ]
    );

    const user = await this.findById(id);
    if (!user) {
      throw new Error('Failed to create invited user');
    }
    return user;
  },

  /**
   * Find a user by invitation token with token details
   */
  async findByInvitationToken(token: string): Promise<UserWithInvitationToken | null> {
    const db = getDb();
    const row = db
      .query('SELECT * FROM users WHERE invitation_token = ?')
      .get(token) as UserRow | null;
    return row ? mapRowToUserWithInvitationToken(row) : null;
  },

  /**
   * Accept invitation: set password, clear token, mark as active.
   * Consumes the token atomically so concurrent accepts cannot both succeed.
   */
  async acceptInvitation(
    id: string,
    token: string,
    passwordHash: string,
    name?: string
  ): Promise<User | null> {
    const db = getDb();
    const now = new Date().toISOString();

    const sets = [
      'password_hash = ?',
      'invitation_token = NULL',
      'invitation_token_expires_at = NULL',
      'invitation_accepted_at = ?',
      'is_active = 1',
      'updated_at = ?',
    ];
    const params: (string | null)[] = [passwordHash, now, now];

    if (name !== undefined) {
      sets.push('name = ?');
      params.push(name);
    }

    params.push(id, token);

    const result = db.run(
      `UPDATE users SET ${sets.join(', ')}
       WHERE id = ?
         AND invitation_token = ?
         AND invitation_accepted_at IS NULL`,
      params
    );

    if (result.changes === 0) {
      return null;
    }

    return this.findById(id);
  },

  /**
   * Update invitation token (for resend)
   */
  async updateInvitationToken(id: string, token: string, expiresAt: string): Promise<User | null> {
    const db = getDb();
    const now = new Date().toISOString();

    db.run(
      `UPDATE users SET invitation_token = ?, invitation_token_expires_at = ?, invitation_sent_at = ?, updated_at = ? WHERE id = ?`,
      [token, expiresAt, now, now, id]
    );

    return this.findById(id);
  },
};
