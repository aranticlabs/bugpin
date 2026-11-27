import { afterEach, beforeEach, expect, it } from 'bun:test';
import { getDb } from '../../../src/server/database/database';
import {
  portalEventsService,
  type PortalEventCheck,
} from '../../../src/server/services/portal-events.service';
import { reporterAuthService } from '../../../src/server/services/reporter-auth.service';
import { projectsService } from '../../../src/server/services/projects.service';
import { settingsService } from '../../../src/server/services/settings.service';
import { Result } from '../../../src/server/utils/result';
import { openPortalDatabase } from './helpers';

let close: () => void;
let unsubscribe: (() => void) | undefined;
let secret: string;
let events: PortalEventCheck[];

beforeEach(async () => {
  close = await openPortalDatabase();
  const login = Result.unwrap(
    reporterAuthService.mintLoginToken('reporter@example.com', 'request')
  );
  const session = Result.unwrap(reporterAuthService.exchange(login.secret));
  secret = session.sessionSecret;
  Result.unwrap(
    await settingsService.update({ reporterPortal: { enabled: true, allowNewReports: true } })
  );
  getDb().exec(
    "INSERT INTO projects (id, name, api_key_hash, api_key_prefix) VALUES ('project', 'Project', 'hash', 'prefix')"
  );
  getDb().run(
    "INSERT INTO reports (id, project_id, title, metadata, reporter_id) VALUES ('report', 'project', 'Report', '{}', ?)",
    [session.reporter.id]
  );
  events = [];
});

afterEach(() => {
  unsubscribe?.();
  unsubscribe = undefined;
  close();
});

async function open() {
  const stream = Result.unwrap(
    await portalEventsService.open(secret, (result) => events.push(Result.unwrap(result)))
  );
  unsubscribe = stream.unsubscribe;
  return stream;
}

it('refreshes a stream opened while its project was inactive and closes it on a later revocation', async () => {
  Result.unwrap(await projectsService.update('project', { isActive: false }));
  const stream = await open();
  Result.unwrap(await projectsService.update('project', { isActive: true }));
  expect(events).toEqual([
    { event: { type: 'access.changed', data: { revoked: false } }, close: false },
  ]);
  expect(Result.unwrap(stream.revalidate())).toEqual({ event: null, close: false });
  Result.unwrap(await projectsService.update('project', { isActive: false }));
  expect(events.at(-1)).toEqual({
    event: { type: 'access.changed', data: { revoked: true } },
    close: true,
  });
});

it('refreshes open streams when submission or messaging settings change without changing report visibility', async () => {
  await open();
  Result.unwrap(await settingsService.update({ reporterPortal: { allowNewReports: false } }));
  Result.unwrap(
    await settingsService.update({ reporterNotifications: { messagingEnabled: false } })
  );
  Result.unwrap(
    await projectsService.update('project', {
      settings: { reporterPortal: { enabled: true, allowNewReports: true } },
    })
  );
  Result.unwrap(
    await settingsService.update({ reporterNotifications: { messagingEnabled: true } })
  );
  expect(events).toHaveLength(4);
  for (const event of events)
    expect(event).toEqual({
      event: { type: 'access.changed', data: { revoked: false } },
      close: false,
    });
});
