import type { APIRequestContext, Page } from '@playwright/test';
import { resolve } from 'node:path';
import type { PortalMe, PortalReportDetail } from '../../src/shared/portal-types';
import type { ReporterPortalLimits } from '../../src/shared/types';
import { test, expect, type Runtime } from './fixtures';

interface PlaybackVideo {
  duration: number;
  currentTime: number;
  readyState: number;
  muted: boolean;
  seeking: boolean;
  videoWidth: number;
  error: { code: number; message: string } | null;
  play(): Promise<void>;
  pause(): void;
}

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVyoAAAAASUVORK5CYII=',
  'base64'
);
const metadata = {
  url: 'https://example.test/checkout',
  browser: { name: 'Browser', version: '1', userAgent: 'Acceptance test' },
  device: { type: 'desktop', os: 'Test' },
  viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
  timestamp: new Date().toISOString(),
};
function staff(runtime: Runtime) {
  return { Cookie: `session=${runtime.staffSession}`, Origin: runtime.staffOrigin };
}
async function submit(request: APIRequestContext, runtime: Runtime, email: string) {
  const response = await request.post(`${runtime.staffOrigin}/api/widget/submit`, {
    headers: { 'x-api-key': runtime.widgetApiKey },
    multipart: {
      data: JSON.stringify({
        title: `Feedback for ${email}`,
        description: 'Original customer description',
        reporterEmail: email,
        metadata,
      }),
      media: { name: 'original.png', mimeType: 'image/png', buffer: pixel },
    },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { reportId: string }).reportId;
}
async function enter(page: Page, runtime: Runtime, email: string) {
  await page.goto(await runtime.waitForLink(email));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: `Feedback for ${email}` })).toBeVisible();
}

test('isolates two reporters and serves original files privately through portal and staff routes', async ({
  page,
  context,
  request,
  runtime,
  browser,
}) => {
  const email = 'isolation-owner@example.test';
  const id = await submit(request, runtime, email);
  await enter(page, runtime, email);
  const own = await page.request.get(`${runtime.portalOrigin}/api/portal/reports/${id}`);
  const report = ((await own.json()) as { report: PortalReportDetail }).report;
  expect(report.description).toBe('Original customer description');
  const updated = await request.patch(`${runtime.staffOrigin}/api/reports/${id}`, {
    headers: staff(runtime),
    data: { description: 'Private staff rewrite' },
  });
  expect(updated.ok()).toBe(true);
  await page.reload();
  await expect(page.getByText('Original customer description')).toBeVisible();
  await expect(page.getByText('Private staff rewrite')).toHaveCount(0);
  const url = new URL(report.files[0].url, runtime.portalOrigin).href;
  for (const method of ['GET', 'HEAD']) {
    const file = await page.request.fetch(url, { method, headers: { Range: 'bytes=0-3' } });
    expect(file.status()).toBe(206);
    expect(file.headers()['cache-control']).toContain('no-store');
    expect(file.headers()['x-content-type-options']).toBe('nosniff');
  }
  expect(
    (
      await request.get(`${runtime.staffOrigin}/api/reports/${id}/files/${report.files[0].id}`, {
        headers: staff(runtime),
      })
    ).ok()
  ).toBe(true);
  const outsider = await browser.newContext();
  try {
    const other = await outsider.newPage();
    await other.goto(`${runtime.portalOrigin}/reporter-portal/`);
    await other.getByLabel('Email address').fill('isolation-outsider@example.test');
    await other.getByRole('button', { name: 'Send me a sign-in link' }).click();
    await other.goto(await runtime.waitForLink('isolation-outsider@example.test'));
    await other.getByRole('button', { name: 'Continue' }).click();
    await expect(other.getByRole('heading', { name: 'My feedback' })).toBeVisible();
    expect(
      (await outsider.request.get(`${runtime.portalOrigin}/api/portal/reports/${id}`)).status()
    ).toBe(404);
    for (const method of ['GET', 'HEAD'])
      expect(
        (await outsider.request.fetch(url, { method, headers: { Range: 'bytes=0-3' } })).status()
      ).toBe(404);
    expect(
      (
        await outsider.request.post(`${runtime.portalOrigin}/api/portal/reports/${id}/messages`, {
          headers: { Origin: runtime.portalOrigin, 'X-BugPin-Portal': '1' },
          multipart: { body: 'Unauthorized' },
        })
      ).status()
    ).toBe(404);
    await other.goto(`${runtime.portalOrigin}/reporter-portal/reports/${id}`);
    await expect(other.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  } finally {
    await outsider.close();
  }
  expect(
    (await context.cookies()).some((cookie) => cookie.name === 'bugpin_reporter_session')
  ).toBe(true);
});

test('revokes live access immediately when an owner is removed and closes a suspended session', async ({
  page,
  request,
  runtime,
}) => {
  const email = 'live-revocation@example.test';
  const id = await submit(request, runtime, email);
  await enter(page, runtime, email);
  const me = (await (await page.request.get(`${runtime.portalOrigin}/api/portal/me`)).json())
    .reporter;
  const events = page.waitForResponse(
    (response) => response.url().endsWith('/api/portal/events') && response.status() === 200
  );
  await page.reload();
  await events;
  const reconnected = page.waitForResponse(
    (response) => response.url().endsWith('/api/portal/events') && response.status() === 200
  );
  expect(
    (
      await request.delete(`${runtime.staffOrigin}/api/reports/${id}/owner`, {
        headers: staff(runtime),
      })
    ).ok()
  ).toBe(true);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByText('Original customer description')).toHaveCount(0);
  await reconnected;
  expect(
    (
      await request.post(`${runtime.staffOrigin}/api/reporters/${me.id}/suspend`, {
        headers: staff(runtime),
      })
    ).ok()
  ).toBe(true);
  await expect(page.getByLabel('Email address')).toBeVisible();
  expect((await page.request.get(`${runtime.portalOrigin}/api/portal/me`)).status()).toBe(401);
});

test('keeps a rejected quota upload out of the thread and preserves the message draft', async ({
  page,
  request,
  runtime,
}) => {
  const email = 'quota@example.test';
  const id = await submit(request, runtime, email);
  await enter(page, runtime, email);
  const settingsResponse = await request.get(`${runtime.staffOrigin}/api/settings`, {
    headers: staff(runtime),
  });
  const settings = (
    (await settingsResponse.json()) as { settings: { reporterPortalLimits: ReporterPortalLimits } }
  ).settings;
  expect(
    (
      await request.put(`${runtime.staffOrigin}/api/settings`, {
        headers: staff(runtime),
        data: {
          reporterPortalLimits: { ...settings.reporterPortalLimits, uploadMbPerReporterPerDay: 1 },
        },
      })
    ).ok()
  ).toBe(true);
  try {
    await page.getByLabel('Message', { exact: true }).fill('Keep this draft');
    await page.getByLabel('Files', { exact: true }).setInputFiles({
      name: 'quota.png',
      mimeType: 'image/png',
      buffer: Buffer.concat([pixel, Buffer.alloc(1024 * 1024)]),
    });
    const rejected = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/reports/${id}/messages`) && response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    expect((await rejected).status()).toBe(413);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue('Keep this draft');
    const detail = (
      await (await page.request.get(`${runtime.portalOrigin}/api/portal/reports/${id}`)).json()
    ).report;
    expect(detail.messages).toHaveLength(0);
  } finally {
    expect(
      (
        await request.put(`${runtime.staffOrigin}/api/settings`, {
          headers: staff(runtime),
          data: { reporterPortalLimits: settings.reporterPortalLimits },
        })
      ).ok()
    ).toBe(true);
  }
});

test('keeps the email unsubscribe URL on the API confirmation surface and accepts a cookie-free one-click POST', async ({
  request,
  runtime,
}) => {
  const email = 'unsubscribe-browser@example.test';
  await submit(request, runtime, email);
  const link = await runtime.waitForUnsubscribeLink(email);
  expect(new URL(link).pathname).toBe('/api/portal/unsubscribe');
  expect(runtime.isSuppressed(email)).toBe(false);
  const get = await request.get(link, { maxRedirects: 0 });
  expect(get.status()).toBe(200);
  expect(get.headers()['location']).toBeUndefined();
  expect(await get.text()).toContain('form method="post"');
  expect(runtime.isSuppressed(email)).toBe(false);
  expect((await request.storageState()).cookies).toEqual([]);
  const post = await request.post(link, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: 'List-Unsubscribe=One-Click',
  });
  expect(post.status()).toBe(200);
  expect(await post.text()).toContain('unsubscribed');
  expect(runtime.isSuppressed(email)).toBe(true);
  const again = await request.post(link, { form: { 'List-Unsubscribe': 'One-Click' } });
  expect(again.status()).toBe(200);
  expect(runtime.isSuppressed(email)).toBe(true);
});

test('plays private video, exposes duration, and seeks after a portal reply', async ({
  page,
  request,
  runtime,
}) => {
  const email = 'video-browser@example.test';
  await submit(request, runtime, email);
  await enter(page, runtime, email);
  await expect(page.getByLabel('Files', { exact: true })).toBeEnabled();
  await page
    .getByLabel('Files', { exact: true })
    .setInputFiles(resolve('tests/fixtures/portal/seekable.webm'));
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const video = page.locator('ol video');
  await expect(video).toBeVisible();
  await expect
    .poll(() =>
      video.evaluate((video: PlaybackVideo) => ({
        duration: String(video.duration),
        finiteDuration: Number.isFinite(video.duration) && video.duration > 0,
        metadataLoaded: video.readyState >= 1,
        error: video.error?.message ?? null,
      }))
    )
    .toMatchObject({ finiteDuration: true, metadataLoaded: true, error: null });
  await video.evaluate(async (video: PlaybackVideo) => {
    video.muted = true;
    await video.play();
  });
  await expect
    .poll(() => video.evaluate((video: PlaybackVideo) => video.currentTime))
    .toBeGreaterThan(0);
  await video.evaluate((video: PlaybackVideo) => {
    video.pause();
    video.currentTime = video.duration / 2;
  });
  await expect
    .poll(() =>
      video.evaluate(
        (video: PlaybackVideo) =>
          !video.seeking && Math.abs(video.currentTime - video.duration / 2) < 0.2
      )
    )
    .toBe(true);
  expect(await video.evaluate((video: PlaybackVideo) => video.videoWidth > 0)).toBe(true);
});

test('keeps deleted ownership inaccessible after a fresh login and permits a later new submission', async ({
  page,
  request,
  runtime,
}) => {
  const email = 'deleted-browser@example.test';
  const oldId = await submit(request, runtime, email);
  await enter(page, runtime, email);
  const me = (
    (await (await page.request.get(`${runtime.portalOrigin}/api/portal/me`)).json()) as {
      reporter: PortalMe;
    }
  ).reporter;
  expect(
    (
      await request.delete(`${runtime.staffOrigin}/api/reporters/${me.id}`, {
        headers: staff(runtime),
        data: { eraseContactDetails: true },
      })
    ).ok()
  ).toBe(true);
  await expect(page.getByLabel('Email address')).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send me a sign-in link' }).click();
  await page.goto(await runtime.waitForLink(email));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'My feedback' })).toBeVisible();
  expect(
    (await page.request.get(`${runtime.portalOrigin}/api/portal/reports/${oldId}`)).status()
  ).toBe(404);
  const freshId = await submit(request, runtime, email);
  await enter(page, runtime, email);
  expect(
    (await page.request.get(`${runtime.portalOrigin}/api/portal/reports/${freshId}`)).status()
  ).toBe(200);
  expect(
    (await page.request.get(`${runtime.portalOrigin}/api/portal/reports/${oldId}`)).status()
  ).toBe(404);
});

test('removes a hidden staff message and its private file from an open portal while retaining staff access', async ({
  page,
  request,
  runtime,
}) => {
  const email = 'moderation-browser@example.test';
  const id = await submit(request, runtime, email);
  await enter(page, runtime, email);
  const sent = await request.post(`${runtime.staffOrigin}/api/reports/${id}/reporter-messages`, {
    headers: staff(runtime),
    multipart: {
      message: 'A reply for the reporter',
      'files[]': { name: 'staff.png', mimeType: 'image/png', buffer: pixel },
    },
  });
  expect(sent.ok()).toBe(true);
  const messageId = ((await sent.json()) as { reporterMessage: { id: string } }).reporterMessage.id;
  await expect(page.getByText('A reply for the reporter')).toBeVisible();
  const detail = (
    (await (await page.request.get(`${runtime.portalOrigin}/api/portal/reports/${id}`)).json()) as {
      report: PortalReportDetail;
    }
  ).report;
  const message = detail.messages.find((message) => message.id === messageId)!;
  const url = new URL(message.files[0].url, runtime.portalOrigin).href;
  expect((await page.request.get(url)).status()).toBe(200);
  expect(
    (
      await request.post(
        `${runtime.staffOrigin}/api/reports/${id}/reporter-messages/${messageId}/hide`,
        { headers: staff(runtime) }
      )
    ).ok()
  ).toBe(true);
  await expect(page.getByText('A reply for the reporter')).toHaveCount(0);
  expect((await page.request.get(url)).status()).toBe(404);
  expect(
    (
      await request.get(`${runtime.staffOrigin}/api/reports/${id}/files/${message.files[0].id}`, {
        headers: staff(runtime),
      })
    ).status()
  ).toBe(200);
});
