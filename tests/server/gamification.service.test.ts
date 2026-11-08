import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { config } from '../../src/server/config';
import {
  closeDatabase,
  getDb,
  initDatabase,
  initSchema,
  runMigrations,
} from '../../src/server/database/database';
import { usersRepo } from '../../src/server/database/repositories/users.repo';
import { gamificationService } from '../../src/server/services/gamification.service';
import { logger } from '../../src/server/utils/logger';
import type { User } from '../../src/shared/types';

const originalConfig = { ...config };
const originalLogger = { ...logger };
let tempDir = '';

async function createUser(role: User['role']): Promise<User> {
  return usersRepo.create({
    email: `user-${crypto.randomUUID()}@example.test`,
    passwordHash: 'hash',
    name: `User ${role}`,
    role,
  });
}

async function reload(user: User): Promise<User> {
  const found = await usersRepo.findById(user.id);
  if (!found) throw new Error('user disappeared');
  return found;
}

beforeAll(async () => {
  logger.info = () => undefined;
  logger.warn = () => undefined;
  tempDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-gamification-'));
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

beforeEach(() => {
  getDb().run("DELETE FROM settings WHERE key LIKE 'gamification_%'");
});

describe('gamificationService settings', () => {
  it('starts disabled with the documented defaults', async () => {
    const result = await gamificationService.getSettings();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toMatchObject({
      enabled: false,
      newUsersDefault: true,
      allowOptOut: true,
      showRanking: true,
    });
  });

  it('stores workspace settings and per-user switches together', async () => {
    const editor = await createUser('editor');
    const result = await gamificationService.update({
      enabled: true,
      showRanking: false,
      users: { [editor.id]: false },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.enabled).toBe(true);
    expect(result.value.showRanking).toBe(false);
    expect(result.value.users.find((user) => user.id === editor.id)?.enabled).toBe(false);
  });

  it('rejects an unknown user without changing anything', async () => {
    const result = await gamificationService.update({
      enabled: true,
      users: { usr_missing: true },
    });

    expect(result).toEqual({
      success: false,
      error: 'User usr_missing not found',
      code: 'NOT_FOUND',
    });
    const settings = await gamificationService.getSettings();
    expect(settings.success && settings.value.enabled).toBe(false);
  });
});

describe('gamificationService self service', () => {
  it('reports viewers as unavailable', async () => {
    await gamificationService.update({ enabled: true });
    const viewer = await createUser('viewer');

    const result = await gamificationService.getSelf(viewer);

    expect(result).toEqual({
      success: true,
      value: { available: false, canOptOut: false, optedOut: false, active: false },
    });
  });

  it('lets a user opt out while the workspace allows it', async () => {
    await gamificationService.update({ enabled: true, allowOptOut: true });
    const editor = await createUser('editor');

    const result = await gamificationService.setOptOut(editor, true);

    expect(result).toEqual({
      success: true,
      value: { available: true, canOptOut: true, optedOut: true, active: false },
    });
    const self = await gamificationService.getSelf(editor);
    expect(self.success && self.value.optedOut).toBe(true);
  });

  it('rejects opting out when the workspace does not allow it', async () => {
    await gamificationService.update({ enabled: true, allowOptOut: false });
    const editor = await createUser('editor');

    const result = await gamificationService.setOptOut(editor, true);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('FORBIDDEN');
  });

  it('rejects opting out for a user an admin turned off', async () => {
    const editor = await createUser('editor');
    await gamificationService.update({ enabled: true, users: { [editor.id]: false } });

    const result = await gamificationService.setOptOut(await reload(editor), true);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('FORBIDDEN');
  });

  it('turns new users off when the workspace default is off', async () => {
    await gamificationService.update({ newUsersDefault: false });
    const editor = await createUser('editor');

    await gamificationService.applyNewUserDefault(editor.id);

    expect((await reload(editor)).gamificationEnabled).toBe(false);
  });
});
