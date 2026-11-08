import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithQueryAndRouter, screen, userEvent, waitFor } from '../../utils';
import { Branding } from '../../../pages/console/Branding';
import { toast } from 'sonner';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { api } from '../../../api/client';
import { cropImageToPng } from '../../../components/branding/cropImage';

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

vi.mock('../../../components/branding/cropImage', () => ({
  cropImageToPng: vi.fn(),
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
          { x: 0, y: 0, width: 50, height: 50 }
        );
      }, [onCropComplete]);
      return <div data-testid="cropper" />;
    },
  };
});

class MockImage {
  static nextWidth = 100;
  static nextHeight = 100;
  static failNext = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = MockImage.nextWidth;
  height = MockImage.nextHeight;

  set src(_value: string) {
    queueMicrotask(() => {
      if (MockImage.failNext) {
        MockImage.failNext = false;
        this.onerror?.();
        return;
      }
      this.width = MockImage.nextWidth;
      this.height = MockImage.nextHeight;
      this.onload?.();
    });
  }
}

describe('Branding', () => {
  const originalImage = global.Image;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  beforeEach(() => {
    server.use(
      http.get('/api/white-label/config', () =>
        HttpResponse.json({
          config: { hideFooterBranding: false, hideEmailBranding: false, customCopyright: '' },
        })
      )
    );
    licenseApiMocks.getFeatures.mockResolvedValue({
      features: {
        'custom-branding': true,
        's3-storage': true,
        webhooks: true,
        'api-access': true,
        'custom-templates': true,
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

    vi.mocked(cropImageToPng).mockResolvedValue(new Blob(['cropped'], { type: 'image/png' }));

    global.Image = MockImage as unknown as typeof Image;
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    global.Image = originalImage;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it('saves only the changed brand colors', async () => {
    const user = userEvent.setup();
    renderWithQueryAndRouter(<Branding />);

    expect(await screen.findByText('Brand Colors')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /change colors/i }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(brandingApiMocks.updateAdminThemeColors.mock.calls[0]?.[0]).toEqual({
        lightButtonColor: '#123456',
      });
      expect(toast.success).toHaveBeenCalled();
    });
  });

  it('resets brand colors into the draft and saves them only from the save bar', async () => {
    const user = userEvent.setup();
    renderWithQueryAndRouter(<Branding />);

    await screen.findByText('Brand Colors');
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reset to default/i }));

    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(brandingApiMocks.updateAdminThemeColors).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(brandingApiMocks.updateAdminThemeColors.mock.calls[0]?.[0]).toEqual({
        lightButtonColor: '#02658D',
        lightButtonHoverColor: '#024F6F',
        darkButtonColor: '#02658D',
        darkTextColor: '#ffffff',
        darkButtonHoverColor: '#036F9B',
        darkTextHoverColor: '#ffffff',
      })
    );
  });

  it('shows an error and releases the object URL when an icon cannot be read', async () => {
    const user = userEvent.setup();
    renderWithQueryAndRouter(<Branding />);

    await user.click(await screen.findByAltText('Light mode icon'));
    await screen.findByText(/edit light mode icon/i);

    const iconInput = document.querySelector(
      'input[type="file"][accept="image/png,image/jpeg,image/webp"]'
    ) as HTMLInputElement;
    MockImage.failNext = true;
    await user.upload(iconInput, new File(['broken'], 'broken.png', { type: 'image/png' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to load image'));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(brandingApiMocks.uploadIcon).not.toHaveBeenCalled();
  });

  it('validates icon uploads and supports cropping', async () => {
    const user = userEvent.setup();
    renderWithQueryAndRouter(<Branding />);

    const lightIcon = await screen.findByAltText('Light mode icon');
    await user.click(lightIcon);
    await screen.findByText(/edit light mode icon/i);

    const iconInput = document.querySelector(
      'input[type="file"][accept="image/png,image/jpeg,image/webp"]'
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
      'input[type="file"][accept="image/png,image/jpeg,image/webp"]'
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
      expect(cropImageToPng).toHaveBeenCalledWith('blob:mock-url', {
        x: 0,
        y: 0,
        width: 50,
        height: 50,
      });
      expect(brandingApiMocks.uploadIcon).toHaveBeenCalledTimes(2);
    });
    const [, croppedFile] = brandingApiMocks.uploadIcon.mock.calls[1] as [string, File];
    expect(croppedFile.name).toBe('icon2.png');
    expect(croppedFile.type).toBe('image/png');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('uploads logos and favicons with validation', async () => {
    const user = userEvent.setup();
    renderWithQueryAndRouter(<Branding />);

    const darkLogo = await screen.findByAltText('Dark mode logo');
    await user.click(darkLogo);
    await screen.findByText(/edit dark mode logo/i);

    const logoInput = document.querySelector(
      'input[type="file"][accept="image/svg+xml,image/png,image/jpeg,image/webp"]'
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
      'input[type="file"][accept="image/png,image/jpeg,.png,.jpg,.jpeg"]'
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

  it('leaves white-label settings to their own page', async () => {
    const get = vi.spyOn(api, 'get');
    renderWithQueryAndRouter(<Branding />);

    expect(await screen.findByText('Brand Colors')).toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: 'Hide admin footer branding' })
    ).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalledWith('/white-label/config');
  });
});
