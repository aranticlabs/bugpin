import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { config } from '../../src/server/config';
import {
  closeDatabase,
  initDatabase,
  initSchema,
  runMigrations,
} from '../../src/server/database/database';
import { usersRepo } from '../../src/server/database/repositories/users.repo';
import { userPreferencesService } from '../../src/server/services/user-preferences.service';
import { logger } from '../../src/server/utils/logger';
import type { User } from '../../src/shared/types';

const originalConfig = { ...config };
const originalLogger = { ...logger };
let tempDir = '';
let user: User;
let otherUser: User;

async function createUser(): Promise<User> {
  return usersRepo.create({
    email: `user-${crypto.randomUUID()}@example.test`,
    passwordHash: 'hash',
    name: 'User',
    role: 'viewer',
  });
}

beforeAll(async () => {
  logger.info = () => undefined;
  logger.warn = () => undefined;
  tempDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-user-preferences-'));
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
  user = await createUser();
  otherUser = await createUser();
});

describe('user preferences', () => {
  it('starts empty and stores preferences per user', async () => {
    expect(await userPreferencesService.get(user.id)).toEqual({ success: true, value: {} });

    const saved = await userPreferencesService.update(user.id, { sidebarWidth: 320 });
    expect(saved.success && saved.value).toEqual({ sidebarWidth: 320 });

    const loaded = await userPreferencesService.get(user.id);
    expect(loaded.success && loaded.value).toEqual({ sidebarWidth: 320 });
    const others = await userPreferencesService.get(otherUser.id);
    expect(others.success && others.value).toEqual({});
  });

  it('overwrites a stored value on update', async () => {
    await userPreferencesService.update(user.id, { sidebarWidth: 300 });
    await userPreferencesService.update(user.id, { sidebarWidth: 400 });

    const loaded = await userPreferencesService.get(user.id);
    expect(loaded.success && loaded.value).toEqual({ sidebarWidth: 400 });
  });

  it('removes preferences together with the user', async () => {
    await userPreferencesService.update(user.id, { sidebarWidth: 300 });
    await usersRepo.delete(user.id);

    const loaded = await userPreferencesService.get(user.id);
    expect(loaded.success && loaded.value).toEqual({});
  });
});
