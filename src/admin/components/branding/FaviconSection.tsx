import { useQuery } from '@tanstack/react-query';
import { brandingApi } from '../../api/branding';
import { BrandImageSection } from './BrandImageSection';
import type { BrandMode } from './imageFile';

const MODE_LABEL: Record<BrandMode, string> = { light: 'Light', dark: 'Dark' };

export function FaviconSection() {
  const { data: config } = useQuery({
    queryKey: ['branding-config'],
    queryFn: brandingApi.getConfig,
  });
  const version = (mode: BrandMode) =>
    mode === 'light' ? config?.faviconLightVersion : config?.faviconDarkVersion;
  const faviconUrl = (mode: BrandMode) =>
    `/branding/${mode}/favicon-${mode}.ico?v=${version(mode) || 'default'}`;

  return (
    <BrandImageSection
      noun="Favicon"
      description="PNG or JPEG, min 512×512px, max. 1MB. Auto-generates all sizes for browsers, Apple Touch Icon, and Android Chrome icons."
      tileClassName="w-20 h-20"
      renderTile={(mode) => (
        <div
          className={`w-20 h-20 rounded-lg border ${mode === 'light' ? 'bg-white' : 'bg-black'} flex items-center justify-center overflow-hidden`}
        >
          <img
            src={faviconUrl(mode)}
            alt={`${MODE_LABEL[mode]} mode favicon`}
            className="w-10 h-10"
          />
        </div>
      )}
      previewClassName="w-32 h-32 rounded-lg border flex items-center justify-center overflow-hidden"
      renderPreview={(mode) =>
        mode && <img src={faviconUrl(mode)} alt={`${mode} mode favicon`} className="w-16 h-16" />
      }
      dialogDescription="Upload a new favicon or reset to default"
      accept="image/png,image/jpeg,.png,.jpg,.jpeg"
      helpText="PNG or JPEG, min 512×512px, max 1MB"
      rules={{
        types: ['image/png', 'image/jpeg', 'image/jpg'],
        maxBytes: 1024 * 1024,
        typeError: 'Invalid file type. Only PNG or JPEG files are allowed',
        sizeError: 'File size must not exceed 1MB',
      }}
      upload={brandingApi.uploadFavicon}
      uploadMessages={{
        success: 'Favicon uploaded successfully',
        error: 'Failed to upload favicon',
      }}
      canRemove={(mode) => {
        const current = version(mode);
        return Boolean(current) && current !== 'default';
      }}
      remove={brandingApi.resetFavicon}
      removeMessages={{
        success: 'Favicon reset to default',
        error: 'Failed to reset favicon',
        label: 'Reset to Default',
        pendingLabel: 'Resetting...',
      }}
    />
  );
}
