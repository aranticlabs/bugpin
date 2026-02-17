import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithQuery, screen, userEvent, waitFor } from '../../utils';
import { BrandingSettings } from '../../../pages/globalsettings/BrandingSettings';
import { toast } from 'sonner';
import { getCroppedImg } from '../../../pages/globalsettings/imageUtils';

const brandingApiMocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  updateAdminThemeColors: vi.fn(),
  uploadIcon: vi.fn(),
  resetIcon: vi.fn(),
  uploadLogo: vi.fn(),
  resetLogo: vi.fn(),
  uploadFavicon: vi.fn(),
  resetFavicon: vi.fn(),
}));

const licenseApiMocks = vi.hoisted(() => ({
  getFeatures: vi.fn(),
}));

vi.mock('../../../api/branding', () => ({
  brandingApi: brandingApiMocks,
}));

vi.mock('../../../api/license', () => ({
  licenseApi: licenseApiMocks,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../../components/ThemeColorPicker', () => ({
  ThemeColorPicker: ({ onChange }: { onChange: (value: Record<string, string>) => void }) => (
    <button type="button" onClick={() => onChange({ lightButtonColor: '#123456' })}>
      Change Colors
    </button>
  ),
}));

vi.mock('../../../pages/globalsettings/imageUtils', () => ({
  getCroppedImg: vi.fn(),
}));

vi.mock('react-easy-crop', async () => {
  const React = await import('react');
  return {
    default: ({
      onCropComplete,
    }: {
      onCropComplete?: (area: unknown, pixels: unknown) => void;
    }) => {
      React.useEffect(() => {
        onCropComplete?.(
          { x: 0, y: 0, width: 50, height: 50 },
          { x: 0, y: 0, width: 50, height: 50 },
        );
      }, [onCropComplete]);
      return <div data-testid="cropper" />;
    },
  };
});

class MockImage {
  static nextWidth = 100;
  static nextHeight = 100;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = MockImage.nextWidth;
  height = MockImage.nextHeight;

  set src(_value: string) {
    queueMicrotask(() => {
      this.width = MockImage.nextWidth;
      this.height = MockImage.nextHeight;
      this.onload?.();
    });
  }
}

describe('BrandingSettings', () => {
  const originalImage = global.Image;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  beforeEach(() => {
    licenseApiMocks.getFeatures.mockResolvedValue({
      features: {
        'custom-branding': true,
        's3-storage': true,
        webhooks: true,
        'api-access': true,
        'custom-email-templates': true,
        'white-label': true,
      },
    });

    brandingApiMocks.getConfig.mockResolvedValue({
      adminThemeColors: {
        lightButtonColor: '#1d4ed8',
        lightTextColor: '#ffffff',
        lightButtonHoverColor: '#1e40af',
        lightTextHoverColor: '#ffffff',
        darkButtonColor: '#38bdf8',
        darkTextColor: '#0f172a',
        darkButtonHoverColor: '#0ea5e9',
        darkTextHoverColor: '#0f172a',
      },
      iconLightUrl: '/icon-light.png',
      iconDarkUrl: '/icon-dark.png',
      logoLightUrl: '/logo-light.png',
      logoDarkUrl: '/logo-dark.png',
      faviconLightVersion: 'v1',
      faviconDarkVersion: 'v1',
    });
    brandingApiMocks.updateAdminThemeColors.mockResolvedValue(undefined);
    brandingApiMocks.uploadIcon.mockResolvedValue('/icon.png');
    brandingApiMocks.uploadLogo.mockResolvedValue('/logo.png');
    brandingApiMocks.uploadFavicon.mockResolvedValue(undefined);
    brandingApiMocks.resetIcon.mockResolvedValue(undefined);
    brandingApiMocks.resetLogo.mockResolvedValue(undefined);
    brandingApiMocks.resetFavicon.mockResolvedValue(undefined);

    vi.mocked(getCroppedImg).mockResolvedValue(new Blob(['cropped'], { type: 'image/jpeg' }));

    global.Image = MockImage as unknown as typeof Image;
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
    global.Image = originalImage;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it('saves and resets brand colors', async () => {
    const user = userEvent.setup();
    renderWithQuery(<BrandingSettings />);

    expect(await screen.findByText('Brand Colors')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /change colors/i }));
    await user.click(screen.getByRole('button', { name: /save colors/i }));

    await waitFor(() => {
      const [colors] = brandingApiMocks.updateAdminThemeColors.mock.calls[0] ?? [];
      expect(colors).toEqual(expect.objectContaining({ lightButtonColor: '#123456' }));
      expect(toast.success).toHaveBeenCalled();
    });

    await user.click(screen.getByRole('button', { name: /reset to default/i }));

    await waitFor(() => {
      const calls = brandingApiMocks.updateAdminThemeColors.mock.calls;
      const lastCall = calls[calls.length - 1] ?? [];
      expect(lastCall[0]).toEqual(expect.objectContaining({ lightButtonColor: '#02658D' }));
    });
  });

  it('validates icon uploads and supports cropping', async () => {
    const user = userEvent.setup();
    renderWithQuery(<BrandingSettings />);

    const lightIcon = await screen.findByAltText('Light mode icon');
    await user.click(lightIcon);
    await screen.findByText(/edit light mode icon/i);

    const iconInput = document.querySelector(
      'input[type="file"][accept="image/png,image/jpeg,image/webp"]',
    ) as HTMLInputElement;
    const badFile = new File(['bad'], 'bad.txt', { type: 'text/plain' });
    await user.upload(iconInput, badFile);
    expect(brandingApiMocks.uploadIcon).not.toHaveBeenCalled();

    MockImage.nextWidth = 100;
    MockImage.nextHeight = 100;
    const goodFile = new File(['good'], 'icon.png', { type: 'image/png' });
    await user.upload(iconInput, goodFile);

    await waitFor(() => {
      expect(brandingApiMocks.uploadIcon).toHaveBeenCalledWith('light', expect.any(File));
    });

    await user.click(screen.getByAltText('Light mode icon'));
    await screen.findByText(/edit light mode icon/i);

    const iconInputSecond = document.querySelector(
      'input[type="file"][accept="image/png,image/jpeg,image/webp"]',
    ) as HTMLInputElement;

    MockImage.nextWidth = 120;
    MockImage.nextHeight = 200;
    const cropFile = new File(['crop'], 'icon2.png', { type: 'image/png' });
    await user.upload(iconInputSecond, cropFile);

    await waitFor(() => {
      expect(screen.getByText('Crop Icon')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /save & upload/i }));

    await waitFor(() => {
      expect(getCroppedImg).toHaveBeenCalled();
      expect(brandingApiMocks.uploadIcon).toHaveBeenCalled();
    });
  });

  it('uploads logos and favicons with validation', async () => {
    const user = userEvent.setup();
    renderWithQuery(<BrandingSettings />);

    const darkLogo = await screen.findByAltText('Dark mode logo');
    await user.click(darkLogo);
    await screen.findByText(/edit dark mode logo/i);

    const logoInput = document.querySelector(
      'input[type="file"][accept="image/svg+xml,image/png,image/jpeg,image/webp"]',
    ) as HTMLInputElement;
    const badLogo = new File(['bad'], 'logo.txt', { type: 'text/plain' });
    await user.upload(logoInput, badLogo);
    expect(brandingApiMocks.uploadLogo).not.toHaveBeenCalled();

    const goodLogo = new File(['good'], 'logo.png', { type: 'image/png' });
    await user.upload(logoInput, goodLogo);

    await waitFor(() => {
      expect(brandingApiMocks.uploadLogo).toHaveBeenCalledWith('dark', expect.any(File));
    });

    const darkFavicon = await screen.findByAltText('Dark mode favicon');
    await user.click(darkFavicon);
    await screen.findByText(/edit dark mode favicon/i);

    const faviconInput = document.querySelector(
      'input[type="file"][accept="image/png,image/jpeg,.png,.jpg,.jpeg"]',
    ) as HTMLInputElement;
    const badFavicon = new File(['bad'], 'favicon.gif', { type: 'image/gif' });
    await user.upload(faviconInput, badFavicon);
    expect(brandingApiMocks.uploadFavicon).not.toHaveBeenCalled();

    const goodFavicon = new File(['good'], 'favicon.png', { type: 'image/png' });
    await user.upload(faviconInput, goodFavicon);

    await waitFor(() => {
      expect(brandingApiMocks.uploadFavicon).toHaveBeenCalledWith('dark', expect.any(File));
    });
  });
});
