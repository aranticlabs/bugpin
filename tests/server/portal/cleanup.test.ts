import { afterEach, beforeEach, expect, it } from 'bun:test';
import { openPortalDatabase } from './helpers';
import { getDb } from '../../../src/server/database/database';
import { reportersRepo } from '../../../src/server/database/repositories/reporters.repo';
import { reporterSessionsRepo } from '../../../src/server/database/repositories/reporter-sessions.repo';
import { reporterAuthTokensRepo } from '../../../src/server/database/repositories/reporter-auth-tokens.repo';
import { projectsRepo } from '../../../src/server/database/repositories/projects.repo';
import { reportsRepo } from '../../../src/server/database/repositories/reports.repo';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { reportersService } from '../../../src/server/services/reporters.service';
import { reporterAuthService } from '../../../src/server/services/reporter-auth.service';
import { cleanupService } from '../../../src/server/services/cleanup.service';
import { hashToken } from '../../../src/server/utils/secure-token';
import { Result } from '../../../src/server/utils/result';

let close: () => void;
const ago = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

beforeEach(async () => {
  close = await openPortalDatabase();
  await settingsRepo.updateAll({ retentionDays: 30 });
});
afterEach(() => close());

function account(name: string, days: number, hasLogin = true) {
  const reporter = reportersRepo.resolve(`${name}@example.com`, name, ago(days));
  return hasLogin ? reportersRepo.recordLogin(reporter.id, ago(days)) : reporter;
}

it('cleans consumed/expired tokens after one day and revoked/expired sessions after seven days', async () => {
  const reporter = account('current', 1);
  const tokens = [
    'expired-old',
    'consumed-old',
    'expired-recent',
    'consumed-recent',
    'revoked-only',
  ].map((name) => ({
    name,
    ...Result.unwrap(reporterAuthService.mintLoginToken(`${name}@example.com`, 'request')),
  }));
  for (const token of tokens) {
    const column = token.name.startsWith('expired')
      ? 'expires_at'
      : token.name.startsWith('consumed')
        ? 'consumed_at'
        : 'revoked_at';
    getDb().run(`UPDATE reporter_auth_tokens SET ${column} = ? WHERE token_hash = ?`, [
      ago(token.name.endsWith('old') ? 25 / 24 : 23 / 24),
      hashToken(token.secret),
    ]);
  }
  for (const [name, column, age] of [
    ['expired-old', 'expires_at', 8],
    ['absolute-old', 'absolute_expires_at', 8],
    ['revoked-old', 'revoked_at', 8],
    ['expired-recent', 'expires_at', 6],
    ['revoked-recent', 'revoked_at', 6],
  ] as const) {
    reporterSessionsRepo.create({
      tokenHash: name,
      reporterId: reporter.id,
      now: ago(1),
      expiresAt: ago(-30),
      absoluteExpiresAt: ago(-90),
    });
    getDb().run(`UPDATE reporter_sessions SET ${column} = ? WHERE token_hash = ?`, [
      ago(age),
      name,
    ]);
  }
  const result = Result.unwrap(await reportersService.cleanup());
  expect(result).toEqual({ tokens: 2, sessions: 3, reporters: 0 });
  for (const token of tokens)
    expect(reporterAuthTokensRepo.findByHash(hashToken(token.secret)) === null).toBe(
      token.name.endsWith('old')
    );
  expect(
    getDb().query('SELECT token_hash FROM reporter_sessions ORDER BY token_hash').all()
  ).toEqual([{ token_hash: 'expired-recent' }, { token_hash: 'revoked-recent' }]);
});

it('removes only idle reporters with no owned or claimable reports and retains suppressions', async () => {
  const expired = account('expired', 31);
  const neverLoggedIn = account('never', 31, false);
  const recent = account('recent', 1);
  const owner = account('owner', 40);
  const claimable = account('claimable', 40);
  const project = await projectsRepo.create({ name: 'Disabled portal', settings: {} });
  const owned = await reportsRepo.create({
    projectId: project.id,
    title: 'Owned report',
    metadata: { timestamp: ago(0) },
  });
  getDb().run('UPDATE reports SET reporter_id = ? WHERE id = ?', [owner.id, owned.id]);
  await reportsRepo.create({
    projectId: project.id,
    title: 'Claimable report',
    metadata: { timestamp: ago(0) },
    claimableEmail: claimable.email,
  });
  getDb().run('INSERT INTO reporter_email_suppressions (email, source) VALUES (?, ?)', [
    expired.email,
    'unsubscribe',
  ]);
  const outstanding = Result.unwrap(
    reporterAuthService.mintLoginToken(expired.email, 'invitation')
  );
  const result = Result.unwrap(await reportersService.cleanup());
  expect(result.reporters).toBe(2);
  expect(reportersRepo.findById(expired.id)).toBeNull();
  expect(reportersRepo.findById(neverLoggedIn.id)).toBeNull();
  for (const kept of [recent, owner, claimable])
    expect(reportersRepo.findById(kept.id)).not.toBeNull();
  expect(
    reporterAuthTokensRepo.findByHash(hashToken(outstanding.secret))!.revokedAt
  ).not.toBeNull();
  expect(getDb().query('SELECT email FROM reporter_email_suppressions').all()).toEqual([
    { email: expired.email },
  ]);
  expect(
    Result.unwrap(
      reporterAuthService.exchange(
        Result.unwrap(reporterAuthService.mintLoginToken(expired.email, 'request')).secret
      )
    ).attachedReportCount
  ).toBe(0);
});

it('keeps idle reporters when retention is zero while still cleaning old credentials', async () => {
  const reporter = account('idle', 100, false);
  await settingsRepo.updateAll({ retentionDays: 0 });
  const token = Result.unwrap(reporterAuthService.mintLoginToken(reporter.email, 'request'));
  getDb().run('UPDATE reporter_auth_tokens SET expires_at = ? WHERE token_hash = ?', [
    ago(2),
    hashToken(token.secret),
  ]);
  expect(Result.unwrap(await reportersService.cleanup())).toEqual({
    tokens: 1,
    sessions: 0,
    reporters: 0,
  });
  expect(reportersRepo.findById(reporter.id)).not.toBeNull();
});

it('anonymizes message snapshots when cleanup removes an idle reporter', async () => {
  const reporter = account('idle', 40);
  getDb().exec(
    'CREATE TABLE report_messages (reporter_id TEXT REFERENCES reporters(id) ON DELETE SET NULL, author_kind TEXT, author_name TEXT)'
  );
  getDb().run("INSERT INTO report_messages VALUES (?, 'reporter', 'Original')", [reporter.id]);
  expect(Result.unwrap(await reportersService.cleanup()).reporters).toBe(1);
  expect(getDb().query('SELECT reporter_id, author_name FROM report_messages').get()).toEqual({
    reporter_id: null,
    author_name: 'Deleted reporter',
  });
});

it('continues report retention by creation date even with recent activity and a conversation', async () => {
  const reporter = account('owner', 1);
  const project = await projectsRepo.create({ name: 'Project' });
  const report = await reportsRepo.create({
    projectId: project.id,
    title: 'Old report',
    metadata: { timestamp: ago(0) },
  });
  getDb().run('UPDATE reports SET created_at = ?, updated_at = ?, reporter_id = ? WHERE id = ?', [
    ago(31),
    ago(0),
    reporter.id,
    report.id,
  ]);
  getDb().exec(
    'CREATE TABLE report_messages (report_id TEXT REFERENCES reports(id) ON DELETE CASCADE, body TEXT)'
  );
  getDb().run("INSERT INTO report_messages VALUES (?, 'Recent conversation')", [report.id]);
  expect(await cleanupService.cleanupOldReports()).toEqual({ deleted: 1, errors: 0 });
  expect(await reportsRepo.findById(report.id)).toBeNull();
  expect(getDb().query('SELECT 1 FROM report_messages').get()).toBeNull();
  expect(reportersRepo.findById(reporter.id)).not.toBeNull();
});
