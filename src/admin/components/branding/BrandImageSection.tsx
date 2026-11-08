import { useRef, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, Upload } from 'lucide-react';
import { ImageUploadTile } from '../ImageUploadTile';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { SettingsCard } from '../ui/settings-card';
import { Spinner } from '../ui/spinner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { cn } from '../../lib/utils';
import { ImageCropDialog } from './ImageCropDialog';
import { useBrandImageUpload } from './useBrandImageUpload';
import type { BrandMode, ImageFileRules } from './imageFile';

const MODES: { mode: BrandMode; label: string }[] = [
  { mode: 'light', label: 'Light Mode' },
  { mode: 'dark', label: 'Dark Mode' },
];

function modeBackground(mode: BrandMode | null): string {
  return mode === 'light' ? 'bg-white' : 'bg-black';
}

interface BrandImageSectionProps {
  /** Capitalized name of the image, used in labels such as "Upload New Icon". */
  noun: string;
  description: string;
  tileClassName: string;
  /** Contents of the tile shown on the card for each mode. */
  renderTile: (mode: BrandMode) => ReactNode;
  /** Contents of the preview box in the edit dialog. */
  renderPreview: (mode: BrandMode | null) => ReactNode;
  previewClassName: string;
  dialogDescription: string;
  accept: string;
  helpText: ReactNode;
  rules: ImageFileRules;
  upload: (mode: BrandMode, file: File) => Promise<unknown>;
  uploadMessages: { success: string; error: string };
  canRemove: (mode: BrandMode) => boolean;
  remove: (mode: BrandMode) => Promise<void>;
  removeMessages: { success: string; error: string; label: string; pendingLabel: string };
  /** Shows a square crop step for non-square images. */
  crop?: { title: string; description: string };
}

export function BrandImageSection({
  noun,
  description,
  tileClassName,
  renderTile,
  renderPreview,
  previewClassName,
  dialogDescription,
  accept,
  helpText,
  rules,
  upload,
  uploadMessages,
  canRemove,
  remove,
  removeMessages,
  crop,
}: BrandImageSectionProps) {
  const queryClient = useQueryClient();
  const [dialogMode, setDialogMode] = useState<BrandMode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lowerNoun = noun.toLowerCase();

  const uploader = useBrandImageUpload({
    rules,
    upload,
    successMessage: uploadMessages.success,
    errorMessage: uploadMessages.error,
    cropToSquare: Boolean(crop),
    onUploaded: () => setDialogMode(null),
  });

  const removeMutation = useMutation({
    mutationFn: remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branding-config'] });
      toast.success(removeMessages.success);
      setDialogMode(null);
    },
    onError: () => {
      toast.error(removeMessages.error);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !dialogMode) return;
    e.target.value = '';
    uploader.selectFile(file, dialogMode);
  };

  return (
    <>
      <SettingsCard title={noun} description={description}>
        <div className="grid grid-cols-2 gap-6">
          {MODES.map(({ mode, label }) => (
            <div key={mode} className="space-y-3">
              <Label>{label}</Label>
              <ImageUploadTile
                label={`Change ${mode} mode ${lowerNoun}`}
                onActivate={() => setDialogMode(mode)}
                className={tileClassName}
              >
                {renderTile(mode)}
              </ImageUploadTile>
            </div>
          ))}
        </div>
      </SettingsCard>

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit {dialogMode === 'light' ? 'Light' : 'Dark'} Mode {noun}
            </DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="flex justify-center">
              <div className={cn(previewClassName, modeBackground(dialogMode))}>
                {renderPreview(dialogMode)}
              </div>
            </div>

            <div className="space-y-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept={accept}
                className="hidden"
              />

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploader.isUploading}
              >
                {uploader.isUploading ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload New {noun}
                  </>
                )}
              </Button>

              {dialogMode && canRemove(dialogMode) && (
                <Button
                  type="button"
                  variant="outline-destructive"
                  className="w-full"
                  onClick={() => removeMutation.mutate(dialogMode)}
                  disabled={removeMutation.isPending || uploader.isUploading}
                >
                  {removeMutation.isPending ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      {removeMessages.pendingLabel}
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      {removeMessages.label}
                    </>
                  )}
                </Button>
              )}

              <p className="text-xs text-center text-muted-foreground">{helpText}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {crop && (
        <ImageCropDialog
          image={uploader.cropImage}
          title={crop.title}
          description={crop.description}
          busy={uploader.isUploading}
          onCancel={uploader.cancelCrop}
          onSave={uploader.saveCrop}
        />
      )}
    </>
  );
}
