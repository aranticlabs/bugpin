import { afterEach, beforeEach, expect, it, spyOn, mock } from 'bun:test';
import { getDb } from '../../../src/server/database/database';
import { reporterAuthService } from '../../../src/server/services/reporter-auth.service';
import { portalProfileService } from '../../../src/server/services/portal-profile.service';
import { reporterSuppressionsRepo } from '../../../src/server/database/repositories/reporter-suppressions.repo';
import { reportersRepo } from '../../../src/server/database/repositories/reporters.repo';
import { Result } from '../../../src/server/utils/result';
import { SUPPORTED_LOCALES } from '../../../src/shared/types';
import type { PortalMe } from '../../../src/shared/portal-types';
import { createPortalTestApp, openPortalDatabase, portalOrigin } from './helpers';

let close: () => void;
let app: ReturnType<typeof createPortalTestApp>;
let cookie: string;
let reporterId: string;

beforeEach(async () => {
  close = await openPortalDatabase();
  app = createPortalTestApp();
  const token = Result.unwrap(reporterAuthService.mintLoginToken('profile@example.com', 'request'));
  const session = Result.unwrap(reporterAuthService.exchange(token.secret));
  cookie = `bugpin_reporter_session=${session.sessionSecret}`;
  reporterId = session.reporter.id;
});
afterEach(() => {
  mock.restore();
  close();
});

function patch(input: unknown, headers: Record<string, string> = {}) {
  return app.request(`${portalOrigin}/api/portal/me`, {
    method: 'PATCH',
    headers: {
      Cookie: cookie,
      Origin: portalOrigin,
      'X-BugPin-Portal': '1',
      'Sec-Fetch-Site': 'same-origin',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(input),
  });
}

it('updates only the current reporter profile and returns the same allowlisted shape as GET me', async () => {
  const other = reportersRepo.resolve(
    'other@example.com',
    'Other reporter',
    new Date().toISOString()
  );
  const response = await patch({
    displayName: '  Jane\u0000\u001f\u007f\u0085 Doe  ',
    locale: 'de',
    emailUpdates: false,
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
  const body = (await response.json()) as { reporter: PortalMe };
  expect(body.reporter).toEqual({
    id: reporterId,
    email: 'profile@example.com',
    displayName: 'Jane Doe',
    locale: 'de',
    emailUpdates: false,
  });
  const me = await app.request(`${portalOrigin}/api/portal/me`, { headers: { Cookie: cookie } });
  expect(((await me.json()) as { reporter: PortalMe }).reporter).toEqual(body.reporter);
  expect(reportersRepo.findById(other.id)!.displayName).toBe('Other reporter');
  expect(
    getDb()
      .query<{ source: string }, [string]>(
        'SELECT source FROM reporter_email_suppressions WHERE email = ?'
      )
      .get(body.reporter.email)!.source
  ).toBe('portal');
});

it('accepts all supported locales, optional fields, and an 80-character name', async () => {
  for (const locale of SUPPORTED_LOCALES) {
    expect((await patch({ locale })).status).toBe(200);
    expect(reportersRepo.findById(reporterId)!.locale).toBe(locale);
  }
  expect((await patch({ displayName: 'A'.repeat(80) })).status).toBe(200);
  expect((await patch({})).status).toBe(200);
  expect(reportersRepo.findById(reporterId)!.displayName).toHaveLength(80);
});

it('rejects invalid profiles, unknown fields, and email/identity changes without partial updates', async () => {
  const before = reportersRepo.findById(reporterId)!;
  for (const input of [
    { displayName: '' },
    { displayName: ' \u0000 ' },
    { displayName: 'A'.repeat(81) },
    { displayName: 123 },
    { locale: 'pt' },
    { locale: '' },
    { emailUpdates: 'false' },
    { email: 'different@example.com' },
    { reporterId: 'someone' },
    { displayName: 'Should not persist', locale: 'invalid', emailUpdates: false },
    null,
    [],
  ]) {
    const response = await patch(input);
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe('VALIDATION_ERROR');
    expect(reportersRepo.findById(reporterId)).toEqual(before);
    expect(reporterSuppressionsRepo.has(before.email)).toBe(false);
  }
});

it('changes only the account email suppression and keeps login credentials usable', async () => {
  reporterSuppressionsRepo.insert('unrelated@example.com', 'unsubscribe');
  reporterSuppressionsRepo.insert('profile@example.com', 'unsubscribe');
  expect((await patch({ emailUpdates: true })).status).toBe(200);
  expect(reporterSuppressionsRepo.has('profile@example.com')).toBe(false);
  expect((await patch({ emailUpdates: false })).status).toBe(200);
  expect((await patch({ emailUpdates: false })).status).toBe(200);
  expect(reporterSuppressionsRepo.has('profile@example.com')).toBe(true);
  expect(reporterSuppressionsRepo.has('unrelated@example.com')).toBe(true);
  const token = Result.unwrap(reporterAuthService.mintLoginToken('profile@example.com', 'request'));
  expect(reporterAuthService.exchange(token.secret).success).toBe(true);
});

it('rolls profile edits back if changing the email preference fails', async () => {
  const before = reportersRepo.findById(reporterId)!;
  spyOn(reporterSuppressionsRepo, 'insert').mockImplementation(() => {
    throw new Error('Database write failed');
  });
  expect(
    (await patch({ displayName: 'Should roll back', locale: 'fr', emailUpdates: false })).status
  ).toBe(500);
  expect(reportersRepo.findById(reporterId)).toEqual(before);
});

it('requires portal Origin, Fetch Metadata, the portal header, a reporter session, and a bounded body', async () => {
  const rejectedHeaders: Record<string, string>[] = [
    { Origin: 'https://other.example.test' },
    { Origin: '' },
    { 'X-BugPin-Portal': '' },
    { 'Sec-Fetch-Site': 'same-site' },
    { 'Sec-Fetch-Site': 'cross-site' },
  ];
  for (const headers of rejectedHeaders)
    expect((await patch({ displayName: 'Rejected' }, headers)).status).toBe(403);
  for (const value of ['', 'session=staff', 'bugpin_reporter_session=invalid']) {
    expect((await patch({ displayName: 'Rejected' }, { Cookie: value })).status).toBe(401);
  }
  expect((await patch({ displayName: 'a'.repeat(5000) })).status).toBe(413);
  expect(reportersRepo.findById(reporterId)!.displayName).not.toBe('Rejected');
});

it('rejects missing or suspended reporters at the service boundary', () => {
  expect(portalProfileService.update('missing', {}).success).toBe(false);
  getDb().run('UPDATE reporters SET suspended_at = ? WHERE id = ?', [
    new Date().toISOString(),
    reporterId,
  ]);
  const result = portalProfileService.update(reporterId, {
    displayName: 'Rejected',
    emailUpdates: false,
  });
  expect(result).toEqual({
    success: false,
    code: 'UNAUTHORIZED',
    error: 'Authentication required',
  });
  expect(reporterSuppressionsRepo.has('profile@example.com')).toBe(false);
});

it('normalizes names to NFC and removes bidi, zero-width, and line/paragraph format controls', async () => {
  for (const [input, expected] of [
    ['  Ja\u202Ene\u202C Doe  ', 'Jane Doe'],
    ['\u2066Jane\u2069 \u200BD\u200Co\u200De\uFEFF', 'Jane Doe'],
    ['Jane\u2028 \u2029Doe', 'Jane Doe'],
    ['  Cafe\u0301  ', 'Café'],
    ['e\u200B\u0301', 'é'],
    ['e\u0301'.repeat(80), 'é'.repeat(80)],
  ]) {
    const response = await patch({ displayName: input });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { reporter: PortalMe }).reporter.displayName).toBe(expected);
    expect(reportersRepo.findById(reporterId)!.displayName).toBe(expected);
  }
  const before = reportersRepo.findById(reporterId)!.displayName;
  for (const input of ['\u202E\u2066\u200B\u2028\u2029', 'e\u0301'.repeat(81)]) {
    expect((await patch({ displayName: input })).status).toBe(400);
    expect(reportersRepo.findById(reporterId)!.displayName).toBe(before);
  }
});
