import { test, expect } from './fixtures';

test('keeps branded link buttons readable and underlined in dark mode', async ({
  page,
  runtime,
}) => {
  await page.route('**/api/portal/config', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { config: { branding: { primaryColor: string } } };
    body.config.branding.primaryColor = '#02658D';
    await route.fulfill({ response, json: body });
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(`${runtime.portalOrigin}/reporter-portal/login#${'A'.repeat(43)}`);
  const link = page.getByRole('link', { name: 'Request a new link' });
  await expect(link).toHaveCSS('color', 'rgb(2, 101, 141)');
  await expect(link).toHaveCSS('text-decoration-line', 'underline');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  function luminance(channels: number[]): number {
    const [r, g, b] = channels.slice(0, 3).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  await expect
    .poll(async () => {
      const colors = await page.evaluate<{
        foreground: number[];
        background: number[];
      }>(`(() => {
      const element = document.querySelector('main a');
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d');
      function pixel(color) {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data);
      }
      for (let parent = element; parent; parent = parent.parentElement) {
        const background = pixel(getComputedStyle(parent).backgroundColor);
        if (background[3] === 255)
          return { foreground: pixel(getComputedStyle(element).color), background };
      }
      throw new Error('Expected an opaque page or card background');
    })()`);
      const foreground = luminance(colors.foreground);
      const background = luminance(colors.background);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    })
    .toBeGreaterThanOrEqual(4.5);
  await expect(link).toHaveCSS('text-decoration-line', 'underline');
});
