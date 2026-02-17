import { describe, it, expect } from 'vitest';
import { renderWithQuery, screen, userEvent, waitFor } from '../utils';
import { BrandingProvider, useBranding } from '../../contexts/BrandingContext';
import { mockBrandingConfig } from '../mocks/handlers';

function hexToHsl(hex: string): string {
  const normalized = hex.replace(/^#/, '');
  const r = parseInt(normalized.substring(0, 2), 16) / 255;
  const g = parseInt(normalized.substring(2, 4), 16) / 255;
  const b = parseInt(normalized.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return `hsl(${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
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

describe('BrandingProvider', () => {
  it('applies admin theme colors and responds to theme changes', async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <BrandingProvider>
        <BrandingConsumer />
      </BrandingProvider>,
    );

    expect(await screen.findByText(mockBrandingConfig.primaryColor)).toBeInTheDocument();

    const lightPrimary = hexToHsl(mockBrandingConfig.adminThemeColors.lightButtonColor);
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(lightPrimary);

    document.documentElement.classList.add('dark');
    const darkPrimary = hexToHsl(mockBrandingConfig.adminThemeColors.darkButtonColor);

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--primary')).toBe(darkPrimary);
    });

    await user.click(screen.getByRole('button', { name: 'Refetch' }));
  });
});
