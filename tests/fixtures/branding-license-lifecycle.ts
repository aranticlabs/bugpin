import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { config } from '../../src/server/config';
import { createApp } from '../../src/server/app';
import { brandingService } from '../../src/server/services/branding.service';
import { emailService } from '../../src/server/services/email.service';
import { settingsCacheService } from '../../src/server/services/settings-cache.service';
import {
  settingsRepo,
  DEFAULT_BRANDING,
  DEFAULT_ADMIN_BUTTON,
} from '../../src/server/database/repositories/settings.repo';
import { getEEPlugin, getEELicenseService } from '../../src/server/utils/ee';
const licenseService = getEELicenseService()!;
import type { AppSettings } from '../../src/shared/types';

async function run() {
  let active = true;
  licenseService.isValid = () => true;
  licenseService.hasFeature = (feature: string) => (feature === 'custom-branding' ? active : true);
  await getEEPlugin()!.initialize();
  const stored = {
    appName: 'Company',
    appUrl: 'https://example.com',
    branding: {
      ...DEFAULT_BRANDING,
      primaryColor: '#123456',
      logoLightUrl: '/branding/light/logo.svg',
    },
    adminButton: { ...DEFAULT_ADMIN_BUTTON, lightButtonColor: '#123456' },
    widgetDialog: { lightButtonColor: '#abcdef' },
    smtpEnabled: true,
  } as AppSettings;
  settingsRepo.getAll = async () => stored;
  settingsCacheService.getAll = async () => stored;
  const snapshot = JSON.stringify(stored);
  const directory = await mkdtemp(join(tmpdir(), 'branding-license-'));
  config.brandingDir = join(directory, 'custom');
  config.defaultBrandingDir = join(directory, 'default');
  for (const dir of [config.brandingDir, config.defaultBrandingDir])
    await mkdir(join(dir, 'light'), { recursive: true });
  const uploaded = join(config.brandingDir, 'light/logo.svg');
  await writeFile(uploaded, 'custom logo');
  await writeFile(join(config.defaultBrandingDir, 'light/logo.svg'), 'default logo');
  const { authService } = await import('../../src/server/services/auth.service');
  const { Result } = await import('../../src/server/utils/result');
  const { emailService: sending } = await import('../../src/server/services/email.service');
  authService.validateSession = async () =>
    Result.ok({
      user: { id: 'admin', role: 'admin', isActive: true } as never,
      session: { id: 'session' } as never,
    });
  let sentHtml = '';
  sending.sendEmail = async (options) => {
    sentHtml = options.html;
    return Result.ok(undefined);
  };
  const app = createApp();
  try {
    for (const enabled of [true, false, true]) {
      active = enabled;
      const result = await brandingService.getBrandingConfig();
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(
          result.value.primaryColor,
          enabled ? '#123456' : DEFAULT_BRANDING.primaryColor
        );
        assert.equal(
          result.value.adminThemeColors.lightButtonColor,
          enabled ? '#123456' : DEFAULT_ADMIN_BUTTON.lightButtonColor
        );
        assert.equal(result.value.logoLightUrl, enabled ? stored.branding.logoLightUrl : null);
        assert.deepEqual(result.value.widgetPrimaryColors, stored.widgetDialog);
      }
      for (const prefix of ['/branding', '/admin/branding']) {
        const response = await app.request(prefix + '/light/logo.svg');
        assert.equal(response.status, 200);
        assert.equal(await response.text(), enabled ? 'custom logo' : 'default logo');
      }
      const html = await emailService.appendFooter('<div class="header">Hello</div>', 'newReport');
      assert.equal(html.includes('/branding/light/logo.svg'), enabled);
      const htmlColor = '<p style="color:__BRAND_COLOR__">Preview</p>';
      for (const prefix of ['/api/templates', '/api/settings/email-templates']) {
        const headers = {
          cookie: 'session=session',
          Origin: new URL(stored.appUrl).origin,
          'Content-Type': 'application/json',
        };
        const payload = { type: 'newReport', subject: 'Preview', html: htmlColor };
        const preview = await app.request(prefix + '/preview', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        assert.equal(preview.status, 200);
        const previewHtml = (await preview.json()).preview.html;
        assert.ok(previewHtml.includes(enabled ? '#123456' : DEFAULT_BRANDING.primaryColor));
        if (!enabled) assert.ok(!previewHtml.includes('#123456'));
        const sent = await app.request(prefix + '/send-test', {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...payload, recipientEmail: 'user@example.com' }),
        });
        assert.equal(sent.status, 200);
        assert.ok(sentHtml.includes(enabled ? '#123456' : DEFAULT_BRANDING.primaryColor));
        if (!enabled) assert.ok(!sentHtml.includes('#123456'));
      }
      assert.equal(JSON.stringify(stored), snapshot);
      assert.equal(await readFile(uploaded, 'utf8'), 'custom logo');
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
await run();
console.log('PASS branding lifecycle');
