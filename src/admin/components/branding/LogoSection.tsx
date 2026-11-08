import { useQuery } from '@tanstack/react-query';
import { brandingApi } from '../../api/branding';
import { BrandImageSection } from './BrandImageSection';
import type { BrandMode } from './imageFile';

const DEFAULT_LOGO: Record<BrandMode, string> = {
  light: '/branding/light/logo-light.svg',
  dark: '/branding/dark/logo-dark.svg',
};

const MODE_LABEL: Record<BrandMode, string> = { light: 'Light', dark: 'Dark' };

export function LogoSection() {
  const { data: config } = useQuery({
    queryKey: ['branding-config'],
    queryFn: brandingApi.getConfig,
  });
  const logoUrl = (mode: BrandMode) =>
    mode === 'light' ? config?.logoLightUrl : config?.logoDarkUrl;

  return (
    <BrandImageSection
      noun="Logo"
      description="Main logo for sidebar and email templates. SVG, PNG, JPEG, or WebP, max. 2MB."
      tileClassName="w-full h-20 mx-auto"
      renderTile={(mode) => {
        const url = logoUrl(mode);
        return (
          <div
            className={`w-full h-20 rounded-lg border ${mode === 'light' ? 'bg-white' : 'bg-black'} flex items-center justify-center overflow-hidden px-4`}
          >
            <img
              src={url || DEFAULT_LOGO[mode]}
              alt={url ? `${MODE_LABEL[mode]} mode logo` : 'Default logo'}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        );
      }}
      previewClassName="w-full max-w-xs h-24 rounded-lg border flex items-center justify-center overflow-hidden px-4"
      renderPreview={(mode) => {
        const url = mode ? logoUrl(mode) : null;
        return (
          <img
            src={url || DEFAULT_LOGO[mode === 'light' ? 'light' : 'dark']}
            alt={url ? `${mode} mode logo` : 'Default logo'}
            className="max-w-full max-h-full object-contain"
          />
        );
      }}
      dialogDescription="Upload a new logo or remove the current one"
      accept="image/svg+xml,image/png,image/jpeg,image/webp"
      helpText={
        <>
          Any aspect ratio allowed, max 2MB
          <br />
          Supported formats: SVG, PNG, JPEG, WebP
        </>
      }
      rules={{
        types: ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'],
        maxBytes: 2 * 1024 * 1024,
        typeError: 'Invalid file type. Allowed: SVG, PNG, JPEG, WebP',
        sizeError: 'File size must not exceed 2MB',
      }}
      upload={brandingApi.uploadLogo}
      uploadMessages={{ success: 'Logo uploaded successfully', error: 'Failed to upload logo' }}
      canRemove={(mode) => Boolean(logoUrl(mode))}
      remove={brandingApi.resetLogo}
      removeMessages={{
        success: 'Logo removed',
        error: 'Failed to remove logo',
        label: 'Remove Logo',
        pendingLabel: 'Removing...',
      }}
    />
  );
}
