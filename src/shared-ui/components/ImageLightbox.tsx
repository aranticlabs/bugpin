import { Download, ExternalLink, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

const LIGHTBOX_LINK_CLASS =
  'flex items-center gap-2 rounded-sm text-white transition-colors hover:text-white/70 focus-visible:focus-ring';

export interface ImageLightboxLabels {
  close: string;
  download: string;
  openInNewTab: string;
  /** Alternative text and accessible description of the full size image */
  alt: string;
}

export interface VideoLightboxLabels {
  close: string;
  /** Accessible description of the video */
  description: string;
}

const LIGHTBOX_CONTENT_CLASS =
  'h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] items-center justify-center border-none bg-transparent p-0 shadow-none sm:rounded-none';

function CloseButton({ label }: { label: string }) {
  return (
    <DialogClose
      className="absolute right-2 top-2 rounded-sm text-white transition-colors hover:text-white/70 focus-visible:focus-ring"
      aria-label={label}
    >
      <X className="size-8" aria-hidden />
    </DialogClose>
  );
}

export function ImageLightbox({
  image,
  onClose,
  labels,
}: {
  image: { url: string; filename: string } | null;
  onClose: () => void;
  labels: ImageLightboxLabels;
}) {
  return (
    <Dialog open={image !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className={LIGHTBOX_CONTENT_CLASS}>
        {image && (
          <>
            <DialogTitle className="sr-only">{image.filename}</DialogTitle>
            <DialogDescription className="sr-only">{labels.alt}</DialogDescription>
            <img
              src={image.url}
              alt={labels.alt}
              className="max-h-full max-w-full object-contain"
            />
            <CloseButton label={labels.close} />
            <div className="absolute bottom-2 right-2 flex items-center gap-4">
              <a href={image.url} download={image.filename} className={LIGHTBOX_LINK_CLASS}>
                <Download className="size-5" aria-hidden />
                {labels.download}
              </a>
              <a
                href={image.url}
                target="_blank"
                rel="noopener noreferrer"
                className={LIGHTBOX_LINK_CLASS}
              >
                <ExternalLink className="size-5" aria-hidden />
                {labels.openInNewTab}
              </a>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function VideoLightbox({
  video,
  onClose,
  labels,
}: {
  video: { url: string; filename: string } | null;
  onClose: () => void;
  labels: VideoLightboxLabels;
}) {
  return (
    <Dialog open={video !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className={LIGHTBOX_CONTENT_CLASS}>
        {video && (
          <>
            <DialogTitle className="sr-only">{video.filename}</DialogTitle>
            <DialogDescription className="sr-only">{labels.description}</DialogDescription>
            <video src={video.url} controls autoPlay className="max-h-full max-w-full" />
            <CloseButton label={labels.close} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
