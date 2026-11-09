import { test, expect } from './fixtures';

test('follows owned feedback, uploads a reply, submits new feedback, and updates the profile on mobile', async ({
  page,
  request,
  runtime,
}) => {
  const configResponse = await request.get(
    `${runtime.staffOrigin}/api/widget/config/${runtime.widgetApiKey}`
  );
  expect((await configResponse.json()).config.portalUrl).toBe(
    `${runtime.portalOrigin}/reporter-portal/`
  );
  const submitted = await request.post(`${runtime.staffOrigin}/api/widget/submit`, {
    headers: { 'x-api-key': runtime.widgetApiKey },
    data: {
      title: 'Browser workflow',
      description: 'Original feedback description',
      reporterEmail: 'workflow@example.test',
      reporterName: 'Jane',
      metadata: {
        url: 'https://example.test/shop',
        browser: { name: 'Chromium', version: '141', userAgent: 'Browser test' },
        device: { type: 'desktop', os: 'Test' },
        viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
        timestamp: new Date().toISOString(),
      },
    },
  });
  expect(submitted.ok()).toBe(true);
  await page.goto(await runtime.waitForLink('workflow@example.test'));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Browser workflow' })).toBeVisible();
  await expect(page.getByText('Original feedback description')).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: /Report details/ }).click();
  await expect(page.getByText('Browser confirmations', { exact: true }).first()).toBeVisible();
  expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
  await page.getByLabel('Message', { exact: true }).fill('Chrome 131, attached screenshot');
  await expect(page.getByLabel('Files', { exact: true })).toBeEnabled();
  await page.getByLabel('Files', { exact: true }).setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVyoAAAAASUVORK5CYII=',
      'base64'
    ),
  });
  const reply = page.waitForResponse(
    (response) => response.url().endsWith('/messages') && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  expect((await reply).status()).toBe(201);
  await expect(page.getByText('Chrome 131, attached screenshot', { exact: true })).toBeVisible();
  await expect(page.locator('ol img')).toBeVisible();
  await page.getByRole('link', { name: 'My feedback' }).click();
  await expect(page.getByRole('heading', { name: 'My feedback' })).toBeVisible();
  await page.getByRole('tab', { name: 'Board', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Browser workflow' })).toBeVisible();
  await page.getByRole('link', { name: 'New feedback' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Created from the portal');
  await page.getByLabel('Description', { exact: true }).fill('New feedback details');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Created from the portal' })).toBeVisible();
  await page.getByRole('button', { name: 'workflow' }).click();
  await page.getByRole('menuitem', { name: 'Display name', exact: true }).click();
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill('Janet');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Janet' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Janet' })).toBeVisible();
});

test('shows working portal links and submission success on the Admin Console widget test page', async ({
  page,
  runtime,
}) => {
  await page.goto(
    `${runtime.staffOrigin}/admin/test-widget?apiKey=${encodeURIComponent(runtime.widgetApiKey)}`
  );
  const widget = page.locator('#bugpin-widget');
  await widget.getByRole('button', { name: 'Report Bug', exact: true }).click();
  await expect(widget.getByRole('link', { name: 'My feedback', exact: true })).toHaveAttribute(
    'href',
    `${runtime.portalOrigin}/reporter-portal/`
  );
  await expect(widget.getByRole('link', { name: 'My feedback', exact: true })).toHaveAttribute(
    'target',
    '_blank'
  );
  await widget.getByRole('textbox', { name: /^Title/ }).fill('Widget portal browser test');
  await widget.getByLabel('Email', { exact: false }).fill('widget-browser@example.test');
  await widget.getByRole('button', { name: 'Submit Report', exact: true }).click();
  await expect(
    widget.getByRole('heading', { name: 'Bug report submitted successfully!' })
  ).toBeVisible();
  await expect(
    widget.getByText('Check your inbox for a sign-in link, or request one in My feedback.')
  ).toBeVisible();
  await expect(widget.getByRole('link', { name: 'View my feedback', exact: true })).toHaveAttribute(
    'href',
    `${runtime.portalOrigin}/reporter-portal/`
  );
  await expect(widget.getByRole('button', { name: 'Close', exact: true }).first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(widget.getByRole('dialog')).toHaveCount(0);
});

for (const status of [429, 503]) {
  test(`recovers a refused ${status} event stream while the reporter session remains valid`, async ({
    page,
    runtime,
  }) => {
    let streams = 0;
    let authenticatedChecks = 0;
    page.on('response', (response) => {
      if (response.url().endsWith('/api/portal/me') && response.status() === 200)
        authenticatedChecks++;
    });
    await page.route('**/api/portal/events', (route) => {
      streams++;
      return streams === 1
        ? route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, error: 'RATE_LIMITED' }),
          })
        : route.continue();
    });
    const email = `recover-${status}@example.test`;
    await page.goto(`${runtime.portalOrigin}/reporter-portal/`);
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Send me a sign-in link' }).click();
    await page.goto(await runtime.waitForLink(email));
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'My feedback' })).toBeVisible();
    await expect.poll(() => streams).toBe(2);
    expect(authenticatedChecks).toBeGreaterThan(0);
    await expect(page.getByText('Connection lost. Reconnecting…')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: `recover-${status}`, exact: true })
    ).toBeVisible();
  });
}
