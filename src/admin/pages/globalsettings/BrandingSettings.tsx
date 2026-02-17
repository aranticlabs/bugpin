import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { brandingApi } from '../../api/branding';
import { licenseApi } from '../../api/license';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { ThemeColorPicker } from '../../components/ThemeColorPicker';
import { Upload, RotateCcw, Camera, Trash2 } from 'lucide-react';
import { Spinner } from '../../components/ui/spinner';
import { UpgradePrompt } from '../../components/UpgradePrompt';
import { getCroppedImg } from './imageUtils';
import type { ThemeColors } from '@shared/types';

// Neutral gray theme - matching globals.css --primary colors
const DEFAULT_ADMIN_COLORS: ThemeColors = {
  lightButtonColor: '#02658D',
  lightTextColor: '#ffffff',
  lightButtonHoverColor: '#024F6F',
  lightTextHoverColor: '#ffffff',
  darkButtonColor: '#02658D',
  darkTextColor: '#ffffff',
  darkButtonHoverColor: '#036F9B',
  darkTextHoverColor: '#ffffff',
};

export function BrandingSettings() {
  const { data: featureStatus, isLoading } = useQuery({
    queryKey: ['license-features'],
    queryFn: licenseApi.getFeatures,
  });

  const isLicensed = featureStatus?.features?.['custom-branding'] ?? false;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!isLicensed) {
    return (
      <UpgradePrompt
        feature="custom-branding"
        title="Custom Branding"
        description="Customize your BugPin instance with your own logo, icon, favicon, and brand colors. Make it truly yours."
      />
    );
  }

  return (
    <div className="space-y-6">
      <BrandColorSection />
      <IconSection />
      <LogoSection />
      <FaviconSection />
    </div>
  );
}

function BrandColorSection() {
  const queryClient = useQueryClient();
  // Track local edits separately - null means use config values
  const [localEdits, setLocalEdits] = useState<ThemeColors | null>(null);

  const { data: config, isLoading } = useQuery({
    queryKey: ['branding-config'],
    queryFn: brandingApi.getConfig,
  });

  const mutation = useMutation({
    mutationFn: brandingApi.updateAdminThemeColors,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branding-config'] });
      setLocalEdits(null); // Clear local edits after save
      toast.success('Brand colors updated');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to update brand colors');
    },
  });

  // Use local edits if user has made changes, otherwise use config directly
  const displayColors = localEdits ?? config?.adminThemeColors ?? DEFAULT_ADMIN_COLORS;

  const handleChange = (newColors: Partial<ThemeColors>) => {
    const current = localEdits ?? config?.adminThemeColors ?? DEFAULT_ADMIN_COLORS;
    setLocalEdits({ ...current, ...newColors });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(displayColors);
  };

  const handleReset = () => {
    setLocalEdits(DEFAULT_ADMIN_COLORS);
    mutation.mutate(DEFAULT_ADMIN_COLORS);
  };

  // Wait for config to fully load before rendering the form
  if (isLoading || !config?.adminThemeColors) {
    return (
      <Card>
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">Brand Colors</CardTitle>
        <CardDescription>
          Configure the primary colors for buttons and interactive elements in the admin portal.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <ThemeColorPicker
            value={displayColors}
            onChange={handleChange}
            disabled={mutation.isPending}
          />

          <div className="flex gap-2 pt-4 border-t">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Spinner size="sm" className="mr-2" />}
              Save Colors
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={mutation.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Default
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}

function IconSection() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [currentMode, setCurrentMode] = useState<'light' | 'dark'>('light');
  const [dialogOpen, setDialogOpen] = useState<'light' | 'dark' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cropping state
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);

  const { data: config } = useQuery({
    queryKey: ['branding-config'],
    queryFn: brandingApi.getConfig,
  });

  const uploadMutation = useMutation({
    mutationFn: ({ mode, file }: { mode: 'light' | 'dark'; file: File }) =>
      brandingApi.uploadIcon(mode, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branding-config'] });
      toast.success('Icon uploaded successfully');
      setUploading(false);
      setDialogOpen(null);
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to upload icon');
      setUploading(false);
    },
  });

  const resetMutation = useMutation({
    mutationFn: brandingApi.resetIcon,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branding-config'] });
      toast.success('Icon removed');
      setDialogOpen(null);
    },
    onError: () => {
      toast.error('Failed to remove icon');
    },
  });

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !dialogOpen) return;

    // Reset input
    if (e.target) {
      e.target.value = '';
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Allowed: PNG, JPEG, WebP');
      return;
    }

    // Validate file size (1MB)
    if (file.size > 1024 * 1024) {
      toast.error('File size must not exceed 1MB');
      return;
    }

    // Check if image is square
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      const isSquare = img.width === img.height;
      URL.revokeObjectURL(objectUrl);

      if (isSquare) {
        // Upload directly if square
        setUploading(true);
        uploadMutation.mutate({ mode: dialogOpen, file });
      } else {
        // Show crop dialog if not square
        setCurrentMode(dialogOpen);
        setOriginalFile(file);
        setImageToCrop(URL.createObjectURL(file));
      }
    };

    img.src = objectUrl;
  };

  const handleCropSave = async () => {
    if (!imageToCrop || !croppedAreaPixels || !originalFile) return;

    try {
      setUploading(true);
      const croppedBlob = await getCroppedImg(imageToCrop, croppedAreaPixels);
      const croppedFile = new File([croppedBlob], originalFile.name, { type: 'image/jpeg' });

      // Clean up
      URL.revokeObjectURL(imageToCrop);
      setImageToCrop(null);
      setOriginalFile(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);

      // Upload cropped image
      uploadMutation.mutate({ mode: currentMode, file: croppedFile });
    } catch {
      toast.error('Failed to crop image');
      setUploading(false);
    }
  };

  const handleCropCancel = () => {
    if (imageToCrop) {
      URL.revokeObjectURL(imageToCrop);
    }
    setImageToCrop(null);
    setOriginalFile(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const openDialog = (mode: 'light' | 'dark') => {
    setDialogOpen(mode);
  };

  const getIconUrl = (mode: 'light' | 'dark') => {
    return mode === 'light' ? config?.iconLightUrl : config?.iconDarkUrl;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Icon</CardTitle>
          <CardDescription>
            Square icon for collapsed sidebar. PNG, JPEG, or WebP, max. 1MB. Resized to 256×256px.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            {/* Light Mode Icon - light background */}
            <div className="space-y-3">
              <Label>Light Mode</Label>
              <div
                className="relative group cursor-pointer w-20 h-20"
                onClick={() => openDialog('light')}
              >
                <div className="w-20 h-20 rounded-lg border bg-white flex items-center justify-center overflow-hidden">
                  {config?.iconLightUrl ? (
                    <img
                      src={config.iconLightUrl}
                      alt="Light mode icon"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <img
                      src="/branding/light/icon-light.svg"
                      alt="Default icon"
                      className="h-10 w-10"
                    />
                  )}
                </div>
                {/* Hover overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>

            {/* Dark Mode Icon - dark background */}
            <div className="space-y-3">
              <Label>Dark Mode</Label>
              <div
                className="relative group cursor-pointer w-20 h-20"
                onClick={() => openDialog('dark')}
              >
                <div className="w-20 h-20 rounded-lg border bg-black flex items-center justify-center overflow-hidden">
                  {config?.iconDarkUrl ? (
                    <img
                      src={config.iconDarkUrl}
                      alt="Dark mode icon"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <img
                      src="/branding/dark/icon-dark.svg"
                      alt="Default icon"
                      className="h-10 w-10"
                    />
                  )}
                </div>
                {/* Hover overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Icon Dialog */}
      <Dialog open={dialogOpen !== null} onOpenChange={(open) => !open && setDialogOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {dialogOpen === 'light' ? 'Light' : 'Dark'} Mode Icon</DialogTitle>
            <DialogDescription>Upload a new icon or remove the current one</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Current Icon Preview */}
            <div className="flex justify-center">
              <div
                className={`w-32 h-32 rounded-lg border flex items-center justify-center overflow-hidden ${
                  dialogOpen === 'light' ? 'bg-white' : 'bg-black'
                }`}
              >
                {dialogOpen && getIconUrl(dialogOpen) ? (
                  <img
                    src={getIconUrl(dialogOpen)!}
                    alt={`${dialogOpen} mode icon`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <img
                    src={
                      dialogOpen === 'light'
                        ? '/branding/light/icon-light.svg'
                        : '/branding/dark/icon-dark.svg'
                    }
                    alt="Default icon"
                    className="h-16 w-16"
                  />
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
              />

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload New Icon
                  </>
                )}
              </Button>

              {dialogOpen && getIconUrl(dialogOpen) && (
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={() => resetMutation.mutate(dialogOpen)}
                  disabled={resetMutation.isPending || uploading}
                >
                  {resetMutation.isPending ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      Removing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove Icon
                    </>
                  )}
                </Button>
              )}

              <p className="text-xs text-center text-muted-foreground">
                Recommended: Square image, max 1MB
                <br />
                Supported formats: PNG, JPEG, WebP
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Crop Dialog */}
      <Dialog open={!!imageToCrop} onOpenChange={(open) => !open && handleCropCancel()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crop Icon</DialogTitle>
            <DialogDescription>Adjust the crop area to create a square icon</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Cropper */}
            <div className="relative h-96 bg-muted rounded-lg overflow-hidden">
              {imageToCrop && (
                <Cropper
                  image={imageToCrop}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              )}
            </div>

            {/* Zoom Slider */}
            <div className="space-y-2">
              <Label>Zoom</Label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCropCancel} disabled={uploading}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCropSave} disabled={uploading}>
              {uploading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Uploading...
                </>
              ) : (
                'Save & Upload'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LogoSection() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState<'light' | 'dark' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: config } = useQuery({
    queryKey: ['branding-config'],
    queryFn: brandingApi.getConfig,
  });

  const uploadMutation = useMutation({
    mutationFn: ({ mode, file }: { mode: 'light' | 'dark'; file: File }) =>
      brandingApi.uploadLogo(mode, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branding-config'] });
      toast.success('Logo uploaded successfully');
      setUploading(false);
      setDialogOpen(null);
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to upload logo');
      setUploading(false);
    },
  });

  const resetMutation = useMutation({
    mutationFn: brandingApi.resetLogo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branding-config'] });
      toast.success('Logo removed');
      setDialogOpen(null);
    },
    onError: () => {
      toast.error('Failed to remove logo');
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !dialogOpen) return;

    // Reset input
    if (e.target) {
      e.target.value = '';
    }

    // Validate file type
    const allowedTypes = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Allowed: SVG, PNG, JPEG, WebP');
      return;
    }

    // Validate file size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File size must not exceed 2MB');
      return;
    }

    setUploading(true);
    uploadMutation.mutate({ mode: dialogOpen, file });
  };

  const getLogoUrl = (mode: 'light' | 'dark') => {
    return mode === 'light' ? config?.logoLightUrl : config?.logoDarkUrl;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>
            Main logo for sidebar and email templates. SVG, PNG, JPEG, or WebP, max. 2MB.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            {/* Light Mode Logo - light background */}
            <div className="space-y-3">
              <Label>Light Mode</Label>
              <div
                className="relative group cursor-pointer w-full h-20 mx-auto"
                onClick={() => setDialogOpen('light')}
              >
                <div className="w-full h-20 rounded-lg border bg-white flex items-center justify-center overflow-hidden px-4">
                  {config?.logoLightUrl ? (
                    <img
                      src={config.logoLightUrl}
                      alt="Light mode logo"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <img
                      src="/branding/light/logo-light.svg"
                      alt="Default logo"
                      className="max-w-full max-h-full object-contain"
                    />
                  )}
                </div>
                {/* Hover overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>

            {/* Dark Mode Logo - dark background */}
            <div className="space-y-3">
              <Label>Dark Mode</Label>
              <div
                className="relative group cursor-pointer w-full h-20 mx-auto"
                onClick={() => setDialogOpen('dark')}
              >
                <div className="w-full h-20 rounded-lg border bg-black flex items-center justify-center overflow-hidden px-4">
                  {config?.logoDarkUrl ? (
                    <img
                      src={config.logoDarkUrl}
                      alt="Dark mode logo"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <img
                      src="/branding/dark/logo-dark.svg"
                      alt="Default logo"
                      className="max-w-full max-h-full object-contain"
                    />
                  )}
                </div>
                {/* Hover overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Logo Dialog */}
      <Dialog open={dialogOpen !== null} onOpenChange={(open) => !open && setDialogOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {dialogOpen === 'light' ? 'Light' : 'Dark'} Mode Logo</DialogTitle>
            <DialogDescription>Upload a new logo or remove the current one</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Current Logo Preview */}
            <div className="flex justify-center">
              <div
                className={`w-full max-w-xs h-24 rounded-lg border flex items-center justify-center overflow-hidden px-4 ${
                  dialogOpen === 'light' ? 'bg-white' : 'bg-black'
                }`}
              >
                {dialogOpen && getLogoUrl(dialogOpen) ? (
                  <img
                    src={getLogoUrl(dialogOpen)!}
                    alt={`${dialogOpen} mode logo`}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <img
                    src={
                      dialogOpen === 'light'
                        ? '/branding/light/logo-light.svg'
                        : '/branding/dark/logo-dark.svg'
                    }
                    alt="Default logo"
                    className="max-w-full max-h-full object-contain"
                  />
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/svg+xml,image/png,image/jpeg,image/webp"
                className="hidden"
              />

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload New Logo
                  </>
                )}
              </Button>

              {dialogOpen && getLogoUrl(dialogOpen) && (
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={() => resetMutation.mutate(dialogOpen)}
                  disabled={resetMutation.isPending || uploading}
                >
                  {resetMutation.isPending ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      Removing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove Logo
                    </>
                  )}
                </Button>
              )}

              <p className="text-xs text-center text-muted-foreground">
                Any aspect ratio allowed, max 2MB
                <br />
                Supported formats: SVG, PNG, JPEG, WebP
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FaviconSection() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState<'light' | 'dark' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: config } = useQuery({
    queryKey: ['branding-config'],
    queryFn: brandingApi.getConfig,
  });

  const uploadMutation = useMutation({
    mutationFn: ({ mode, file }: { mode: 'light' | 'dark'; file: File }) =>
      brandingApi.uploadFavicon(mode, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branding-config'] });
      toast.success('Favicon uploaded successfully');
      setUploading(false);
      setDialogOpen(null);
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to upload favicon');
      setUploading(false);
    },
  });

  const resetMutation = useMutation({
    mutationFn: brandingApi.resetFavicon,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branding-config'] });
      toast.success('Favicon reset to default');
      setDialogOpen(null);
    },
    onError: () => {
      toast.error('Failed to reset favicon');
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !dialogOpen) return;

    // Reset input
    if (e.target) {
      e.target.value = '';
    }

    // Validate file type - PNG or JPEG for auto-generation
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Only PNG or JPEG files are allowed');
      return;
    }

    // Validate file size (1MB for source images)
    if (file.size > 1024 * 1024) {
      toast.error('File size must not exceed 1MB');
      return;
    }

    setUploading(true);
    uploadMutation.mutate({ mode: dialogOpen, file });
  };

  const getFaviconUrl = (mode: 'light' | 'dark') => {
    const version = mode === 'light' ? config?.faviconLightVersion : config?.faviconDarkVersion;
    return `/branding/${mode}/favicon-${mode}.ico?v=${version || 'default'}`;
  };

  const isCustomFavicon = (mode: 'light' | 'dark') => {
    const version = mode === 'light' ? config?.faviconLightVersion : config?.faviconDarkVersion;
    return version && version !== 'default';
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Favicon</CardTitle>
          <CardDescription>
            PNG or JPEG, min 512×512px, max. 1MB. Auto-generates all sizes for browsers, Apple Touch
            Icon, and Android Chrome icons.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            {/* Light Mode Favicon */}
            <div className="space-y-3">
              <Label>Light Mode</Label>
              <div
                className="relative group cursor-pointer w-20 h-20"
                onClick={() => setDialogOpen('light')}
              >
                <div className="w-20 h-20 rounded-lg border bg-white flex items-center justify-center overflow-hidden">
                  <img
                    src={getFaviconUrl('light')}
                    alt="Light mode favicon"
                    className="w-10 h-10"
                  />
                </div>
                {/* Hover overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>

            {/* Dark Mode Favicon */}
            <div className="space-y-3">
              <Label>Dark Mode</Label>
              <div
                className="relative group cursor-pointer w-20 h-20"
                onClick={() => setDialogOpen('dark')}
              >
                <div className="w-20 h-20 rounded-lg border bg-black flex items-center justify-center overflow-hidden">
                  <img src={getFaviconUrl('dark')} alt="Dark mode favicon" className="w-10 h-10" />
                </div>
                {/* Hover overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Favicon Dialog */}
      <Dialog open={dialogOpen !== null} onOpenChange={(open) => !open && setDialogOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {dialogOpen === 'light' ? 'Light' : 'Dark'} Mode Favicon</DialogTitle>
            <DialogDescription>Upload a new favicon or reset to default</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Current Favicon Preview */}
            <div className="flex justify-center">
              <div
                className={`w-32 h-32 rounded-lg border flex items-center justify-center overflow-hidden ${
                  dialogOpen === 'light' ? 'bg-white' : 'bg-black'
                }`}
              >
                {dialogOpen && (
                  <img
                    src={getFaviconUrl(dialogOpen)}
                    alt={`${dialogOpen} mode favicon`}
                    className="w-16 h-16"
                  />
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                className="hidden"
              />

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload New Favicon
                  </>
                )}
              </Button>

              {dialogOpen && isCustomFavicon(dialogOpen) && (
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={() => resetMutation.mutate(dialogOpen)}
                  disabled={resetMutation.isPending || uploading}
                >
                  {resetMutation.isPending ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Reset to Default
                    </>
                  )}
                </Button>
              )}

              <p className="text-xs text-center text-muted-foreground">
                PNG or JPEG, min 512×512px, max 1MB
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
