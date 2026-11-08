import { useCallback, useId, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Spinner } from '../ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface ImageCropDialogProps {
  image: string | null;
  title: string;
  description: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (area: Area) => void;
}

export function ImageCropDialog({
  image,
  title,
  description,
  busy,
  onCancel,
  onSave,
}: ImageCropDialogProps) {
  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <CropEditor image={image} busy={busy} onCancel={onCancel} onSave={onSave} />
      </DialogContent>
    </Dialog>
  );
}

function CropEditor({
  image,
  busy,
  onCancel,
  onSave,
}: Pick<ImageCropDialogProps, 'image' | 'busy' | 'onCancel' | 'onSave'>) {
  const zoomId = useId();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setArea(croppedAreaPixels);
  }, []);

  return (
    <>
      <div className="space-y-4">
        <div className="relative h-96 bg-muted rounded-lg overflow-hidden">
          {image && (
            <Cropper
              image={image}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={zoomId}>Zoom</Label>
          <input
            id={zoomId}
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
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" onClick={() => area && onSave(area)} disabled={busy}>
          {busy ? (
            <>
              <Spinner size="sm" className="mr-2" />
              Uploading...
            </>
          ) : (
            'Save & Upload'
          )}
        </Button>
      </DialogFooter>
    </>
  );
}
