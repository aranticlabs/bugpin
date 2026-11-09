import { test, expect } from './fixtures';

test('requests a real SMTP login link, previews without a session, then exchanges on Continue', async ({
  page,
  context,
  runtime,
}) => {
  await page.goto(`${runtime.portalOrigin}/reporter-portal/`);
  await page.getByLabel('Email address').fill('login@example.test');
  await page.getByRole('button', { name: 'Send me a sign-in link' }).click();
  await expect(page.getByRole('status')).toContainText('It expires in 15 minutes');
  const link = await runtime.waitForLink('login@example.test');
  let previewed = false;
  page.on('request', (request) => {
    if (request.url().endsWith('/auth/preview')) previewed = true;
  });
  await page.goto(link);
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  expect(previewed).toBe(true);
  expect(new URL(page.url()).hash).toBe('');
  expect(
    (await context.cookies()).some((cookie) => cookie.name === 'bugpin_reporter_session')
  ).toBe(false);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'My feedback' })).toBeVisible();
  const cookie = (await context.cookies()).find((item) => item.name === 'bugpin_reporter_session');
  expect(cookie).toMatchObject({ domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' });
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByLabel('Email address')).toBeVisible();
  expect((await context.cookies()).some((item) => item.name === 'bugpin_reporter_session')).toBe(
    false
  );
});

test('offers a fresh email for an expired link without consuming it on page load', async ({
  page,
  runtime,
}) => {
  let previews = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/auth/preview')) previews++;
  });
  await page.goto(`${runtime.portalOrigin}/reporter-portal/`);
  await page.getByLabel('Email address').fill('expired@example.test');
  await page.getByRole('button', { name: 'Send me a sign-in link' }).click();
  const link = await runtime.waitForLink('expired@example.test');
  runtime.expireLinks('expired@example.test');
  await page.goto(link);
  await expect(page.getByText(/This link expired/)).toBeVisible();
  await page.getByRole('button', { name: 'Send a new link' }).click();
  const next = await runtime.waitForLink('expired@example.test');
  expect(next).not.toBe(link);
  await page.goto(next);
  await expect.poll(() => previews).toBe(2);
  expect(new URL(page.url()).hash.length).toBe(0);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'My feedback' })).toBeVisible();
});

test('isolates cookies and routes between hosts and rejects unknown hosts', async ({
  page,
  context,
  request,
  runtime,
}) => {
  await context.addCookies([
    {
      name: 'session',
      value: runtime.staffSession,
      url: runtime.staffOrigin,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.goto(`${runtime.portalOrigin}/reporter-portal/`);
  await page.getByLabel('Email address').fill('isolation@example.test');
  await page.getByRole('button', { name: 'Send me a sign-in link' }).click();
  await page.goto(await runtime.waitForLink('isolation@example.test'));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'My feedback' })).toBeVisible();
  const staffCookies = await context.cookies(runtime.staffOrigin);
  const portalCookies = await context.cookies(runtime.portalOrigin);
  expect(staffCookies.some((cookie) => cookie.name === 'bugpin_reporter_session')).toBe(false);
  expect(portalCookies.some((cookie) => cookie.name === 'session')).toBe(false);
  expect((await request.get(`${runtime.staffOrigin}/api/portal/me`)).status()).toBe(404);
  expect((await request.get(`${runtime.portalOrigin}/api/reports`)).status()).toBe(404);
  expect(
    (
      await request.get(`${runtime.staffOrigin}/health`, {
        headers: { Host: 'unknown.example.test' },
      })
    ).status()
  ).toBe(421);
  const response = await page.goto(`${runtime.portalOrigin}/reporter-portal/login`);
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
  expect(response?.headers()['cache-control']).toBe('no-store');
});
