import { Download, ExternalLink, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';

const LIGHTBOX_LINK_CLASS =
  'flex items-center gap-2 rounded-sm text-white transition-colors hover:text-white/70 focus-visible:focus-ring';

export function ImageLightbox({
  image,
  onClose,
}: {
  image: { url: string; filename: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={image !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] items-center justify-center border-none bg-transparent p-0 shadow-none sm:rounded-none"
      >
        {image && (
          <>
            <DialogTitle className="sr-only">{image.filename}</DialogTitle>
            <DialogDescription className="sr-only">Full size screenshot</DialogDescription>
            <img
              src={image.url}
              alt="Full size screenshot"
              className="max-h-full max-w-full object-contain"
            />
            <DialogClose
              className="absolute right-2 top-2 rounded-sm text-white transition-colors hover:text-white/70 focus-visible:focus-ring"
              aria-label="Close"
            >
              <X className="size-8" aria-hidden />
            </DialogClose>
            <div className="absolute bottom-2 right-2 flex items-center gap-4">
              <a href={image.url} download={image.filename} className={LIGHTBOX_LINK_CLASS}>
                <Download className="size-5" aria-hidden />
                Download
              </a>
              <a
                href={image.url}
                target="_blank"
                rel="noopener noreferrer"
                className={LIGHTBOX_LINK_CLASS}
              >
                <ExternalLink className="size-5" aria-hidden />
                Open in new tab
              </a>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
