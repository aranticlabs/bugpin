import { describe, it, expect, vi, afterEach } from 'vitest';
import { brandingApi, type BrandingConfig } from '../../api/branding';
import { api } from '../../api/client';

const themeColors = {
  lightButtonColor: '#ffffff',
  lightTextColor: '#000000',
  lightButtonHoverColor: '#f5f5f5',
  lightTextHoverColor: '#111111',
  darkButtonColor: '#111111',
  darkTextColor: '#ffffff',
  darkButtonHoverColor: '#222222',
  darkTextHoverColor: '#f0f0f0',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('brandingApi', () => {
  it('fetches branding config', async () => {
    const config: BrandingConfig = {
      primaryColor: '#1f2937',
      logoLightUrl: '/logo-light.svg',
      logoDarkUrl: '/logo-dark.svg',
      iconLightUrl: '/icon-light.svg',
      iconDarkUrl: '/icon-dark.svg',
      faviconLightVersion: '1',
      faviconDarkVersion: '2',
      adminThemeColors: themeColors,
      widgetPrimaryColors: themeColors,
    };

    const getSpy = vi.spyOn(api, 'get').mockResolvedValue({ data: { config } });

    const result = await brandingApi.getConfig();

    expect(result).toEqual(config);
    expect(getSpy).toHaveBeenCalledWith('/branding/config');
  });

  it('uploads logo and icon using multipart form data', async () => {
    const postSpy = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({ data: { url: '/branding/light/logo-light.svg' } })
      .mockResolvedValueOnce({ data: { url: '/branding/dark/icon-dark.svg' } });

    const logoFile = new File([new Uint8Array([1])], 'logo.svg', { type: 'image/svg+xml' });
    const iconFile = new File([new Uint8Array([2])], 'icon.svg', { type: 'image/svg+xml' });

    const logoUrl = await brandingApi.uploadLogo('light', logoFile);
    const iconUrl = await brandingApi.uploadIcon('dark', iconFile);

    expect(logoUrl).toBe('/branding/light/logo-light.svg');
    expect(iconUrl).toBe('/branding/dark/icon-dark.svg');

    const [logoCall, iconCall] = postSpy.mock.calls;
    const logoForm = logoCall?.[1] as FormData;
    const iconForm = iconCall?.[1] as FormData;

    expect(logoCall?.[0]).toBe('/branding/logo/light');
    expect(iconCall?.[0]).toBe('/branding/icon/dark');
    expect(logoForm.get('file')).toBe(logoFile);
    expect(iconForm.get('file')).toBe(iconFile);
  });

  it('uploads favicon with multipart form data', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    const file = new File([new Uint8Array([3])], 'favicon.ico', { type: 'image/x-icon' });

    await brandingApi.uploadFavicon('dark', file);

    const [url, formData, config] = postSpy.mock.calls[0] ?? [];
    expect(url).toBe('/branding/favicon/dark');
    expect((formData as FormData).get('file')).toBe(file);
    expect((config as { headers?: Record<string, string> })?.headers?.['Content-Type']).toBe(
      'multipart/form-data',
    );
  });

  it('updates colors using put endpoints', async () => {
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: {} });

    await brandingApi.updatePrimaryColor('#ff0000');
    await brandingApi.updateAdminThemeColors({ lightButtonColor: '#fafafa' });
    await brandingApi.updateWidgetPrimaryColors({ darkTextColor: '#111111' });

    expect(putSpy).toHaveBeenCalledWith('/branding/primary-color', { color: '#ff0000' });
    expect(putSpy).toHaveBeenCalledWith('/branding/admin-theme-colors', {
      lightButtonColor: '#fafafa',
    });
    expect(putSpy).toHaveBeenCalledWith('/branding/widget-primary-colors', {
      darkTextColor: '#111111',
    });
  });

  it('resets branding assets and all settings', async () => {
    const deleteSpy = vi.spyOn(api, 'delete').mockResolvedValue({ data: {} });
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });

    await brandingApi.resetLogo('light');
    await brandingApi.resetIcon('dark');
    await brandingApi.resetFavicon('light');
    await brandingApi.resetAll();

    expect(deleteSpy).toHaveBeenCalledWith('/branding/logo/light');
    expect(deleteSpy).toHaveBeenCalledWith('/branding/icon/dark');
    expect(deleteSpy).toHaveBeenCalledWith('/branding/favicon/light');
    expect(postSpy).toHaveBeenCalledWith('/branding/reset');
  });
});
