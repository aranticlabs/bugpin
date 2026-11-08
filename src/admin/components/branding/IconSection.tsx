import { useQuery } from '@tanstack/react-query';
import { brandingApi } from '../../api/branding';
import { BrandImageSection } from './BrandImageSection';
import type { BrandMode } from './imageFile';

const DEFAULT_ICON: Record<BrandMode, string> = {
  light: '/branding/light/icon-light.svg',
  dark: '/branding/dark/icon-dark.svg',
};

const MODE_LABEL: Record<BrandMode, string> = { light: 'Light', dark: 'Dark' };

export function IconSection() {
  const { data: config } = useQuery({
    queryKey: ['branding-config'],
    queryFn: brandingApi.getConfig,
  });
  const iconUrl = (mode: BrandMode) =>
    mode === 'light' ? config?.iconLightUrl : config?.iconDarkUrl;

  return (
    <BrandImageSection
      noun="Icon"
      description="Square icon for collapsed sidebar. PNG, JPEG, or WebP, max. 1MB. Resized to 256×256px."
      tileClassName="w-20 h-20"
      renderTile={(mode) => {
        const url = iconUrl(mode);
        return (
          <div
            className={`w-20 h-20 rounded-lg border ${mode === 'light' ? 'bg-white' : 'bg-black'} flex items-center justify-center overflow-hidden`}
          >
            {url ? (
              <img
                src={url}
                alt={`${MODE_LABEL[mode]} mode icon`}
                className="w-full h-full object-contain"
              />
            ) : (
              <img src={DEFAULT_ICON[mode]} alt="Default icon" className="h-10 w-10" />
            )}
          </div>
        );
      }}
      previewClassName="w-32 h-32 rounded-lg border flex items-center justify-center overflow-hidden"
      renderPreview={(mode) => {
        const url = mode ? iconUrl(mode) : null;
        return url ? (
          <img src={url} alt={`${mode} mode icon`} className="w-full h-full object-contain" />
        ) : (
          <img
            src={DEFAULT_ICON[mode === 'light' ? 'light' : 'dark']}
            alt="Default icon"
            className="h-16 w-16"
          />
        );
      }}
      dialogDescription="Upload a new icon or remove the current one"
      accept="image/png,image/jpeg,image/webp"
      helpText={
        <>
          Recommended: Square image, max 1MB
          <br />
          Supported formats: PNG, JPEG, WebP
        </>
      }
      rules={{
        types: ['image/png', 'image/jpeg', 'image/webp'],
        maxBytes: 1024 * 1024,
        typeError: 'Invalid file type. Allowed: PNG, JPEG, WebP',
        sizeError: 'File size must not exceed 1MB',
      }}
      upload={brandingApi.uploadIcon}
      uploadMessages={{ success: 'Icon uploaded successfully', error: 'Failed to upload icon' }}
      canRemove={(mode) => Boolean(iconUrl(mode))}
      remove={brandingApi.resetIcon}
      removeMessages={{
        success: 'Icon removed',
        error: 'Failed to remove icon',
        label: 'Remove Icon',
        pendingLabel: 'Removing...',
      }}
      crop={{
        title: 'Crop Icon',
        description: 'Adjust the crop area to create a square icon',
      }}
    />
  );
}
