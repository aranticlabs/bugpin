import { describe, it, expect, vi } from 'vitest';
import { brandingApi } from '../../api/branding';
import { renderWithQuery, screen, userEvent, waitFor } from '../utils';
import {
  ADMIN_THEME_STYLE_ID,
  BrandingProvider,
  buildAdminThemeCss,
  useBranding,
} from '../../contexts/BrandingContext';
import { mockBrandingConfig } from '../mocks/handlers';

function themeCss(): string {
  return document.getElementById(ADMIN_THEME_STYLE_ID)?.textContent ?? '';
}

function BrandingConsumer() {
  const { config, isLoading, refetch } = useBranding();

  if (isLoading) {
    return <div>Loading</div>;
  }

  return (
    <div>
      <span>{config?.primaryColor}</span>
      <button type="button" onClick={refetch}>
        Refetch
      </button>
    </div>
  );
}

describe('buildAdminThemeCss', () => {
  it('writes light and dark primary tokens as hex', () => {
    const css = buildAdminThemeCss(mockBrandingConfig.adminThemeColors);
    expect(css).toContain(
      `:root:root { --primary: ${mockBrandingConfig.adminThemeColors.lightButtonColor};`
    );
    expect(css).toContain(
      `:root.dark { --primary: ${mockBrandingConfig.adminThemeColors.darkButtonColor};`
    );
    expect(css).toContain(
      `--primary-hover: ${mockBrandingConfig.adminThemeColors.lightButtonHoverColor};`
    );
  });

  it('drops values that are not six-digit hex colors', () => {
    const css = buildAdminThemeCss({
      ...mockBrandingConfig.adminThemeColors,
      lightButtonColor: 'red; } body { display: none',
    });
    expect(css).not.toContain('display: none');
    expect(css).not.toMatch(/:root:root \{ --primary:/);
  });
});

describe('BrandingProvider', () => {
  it('applies admin theme colors through one stylesheet', async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <BrandingProvider>
        <BrandingConsumer />
      </BrandingProvider>
    );

    expect(await screen.findByText(mockBrandingConfig.primaryColor)).toBeInTheDocument();
    expect(themeCss()).toBe(buildAdminThemeCss(mockBrandingConfig.adminThemeColors));

    await user.click(screen.getByRole('button', { name: 'Refetch' }));
  });
});

it('updates colors and favicon links when customization is suspended and restored', async () => {
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = '/branding/light/favicon-light.ico';
  document.head.append(link);
  let active = true;
  const defaults = {
    ...mockBrandingConfig,
    primaryColor: '#02658D',
    faviconLightVersion: 'default',
    adminThemeColors: { ...mockBrandingConfig.adminThemeColors, lightButtonColor: '#02658D' },
  };
  const getter = vi
    .spyOn(brandingApi, 'getConfig')
    .mockImplementation(async () => (active ? mockBrandingConfig : defaults));
  try {
    const user = userEvent.setup();
    renderWithQuery(
      <BrandingProvider>
        <BrandingConsumer />
      </BrandingProvider>
    );
    await screen.findByText(mockBrandingConfig.primaryColor);
    for (const enabled of [false, true]) {
      active = enabled;
      await user.click(screen.getByRole('button', { name: 'Refetch' }));
      await waitFor(() => {
        expect(themeCss()).toContain(
          `--primary: ${enabled ? mockBrandingConfig.adminThemeColors.lightButtonColor : '#02658D'};`
        );
        expect(new URL(link.href).searchParams.get('v')).toBe(
          enabled ? mockBrandingConfig.faviconLightVersion : 'default'
        );
      });
    }
  } finally {
    getter.mockRestore();
    link.remove();
  }
});
