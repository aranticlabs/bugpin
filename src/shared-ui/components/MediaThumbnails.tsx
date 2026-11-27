import { useState } from 'react';
import { Download, FileText, Play, ZoomIn } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import {
  ImageLightbox,
  VideoLightbox,
  type ImageLightboxLabels,
  type VideoLightboxLabels,
} from './ImageLightbox';

export interface MediaItem {
  id: string;
  url: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  /** Accessible name, for example "Screenshot 1" */
  label: string;
  /** Name used when the file is downloaded */
  filename: string;
  /** Short secondary text such as the dimensions or the file size */
  details?: string;
}

export interface MediaThumbnailsLabels {
  view: (label: string) => string;
  play: (label: string) => string;
  download: (label: string) => string;
  image: ImageLightboxLabels;
  video: VideoLightboxLabels;
}

type Variant = 'gallery' | 'compact' | 'strip';

function kind(item: MediaItem): 'image' | 'video' | 'file' {
  if (item.mimeType.startsWith('image/')) return 'image';
  if (item.mimeType.startsWith('video/')) return 'video';
  return 'file';
}

function Preview({ item, className }: { item: MediaItem; className: string }) {
  return kind(item) === 'video' ? (
    <video src={item.url} preload="metadata" muted className={className} aria-hidden />
  ) : (
    <img src={item.url} alt="" loading="lazy" className={className} />
  );
}

function Overlay({ item, className }: { item: MediaItem; className?: string }) {
  return kind(item) === 'video' ? (
    <span
      className={cn(
        'absolute inset-0 flex items-center justify-center bg-black/35 transition-colors group-hover:bg-black/50',
        className
      )}
    >
      <Play className="size-5 fill-white text-white" aria-hidden />
    </span>
  ) : (
    <span
      className={cn(
        'absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/10',
        className
      )}
    >
      <ZoomIn
        className="size-8 text-white opacity-0 drop-shadow-lg transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </span>
  );
}

export function MediaThumbnails({
  items,
  labels,
  variant = 'gallery',
  className,
}: {
  items: MediaItem[];
  labels: MediaThumbnailsLabels;
  variant?: Variant;
  className?: string;
}) {
  const [image, setImage] = useState<MediaItem | null>(null);
  const [video, setVideo] = useState<MediaItem | null>(null);
  const media = items.filter((item) => kind(item) !== 'file');
  const files = items.filter((item) => kind(item) === 'file');
  if (!items.length) return null;

  const open = (item: MediaItem) => (kind(item) === 'video' ? setVideo(item) : setImage(item));
  const triggerLabel = (item: MediaItem) =>
    kind(item) === 'video' ? labels.play(item.label) : labels.view(item.label);
  const many = media.length > 1;

  return (
    <div className={cn('min-w-0 space-y-3', className)}>
      {media.length > 0 && variant === 'gallery' && (
        <ul className={cn('grid gap-4', many ? 'grid-cols-2' : 'grid-cols-1')}>
          {media.map((item) => (
            <li
              key={item.id}
              className="group relative min-w-0 overflow-hidden rounded-lg border bg-background"
            >
              <button
                type="button"
                onClick={() => open(item)}
                className={cn(
                  'relative block w-full rounded-t-lg',
                  kind(item) === 'video' ? 'cursor-pointer' : 'cursor-zoom-in'
                )}
                aria-label={triggerLabel(item)}
              >
                <Preview
                  item={item}
                  className={cn(
                    'w-full bg-muted object-contain',
                    many ? 'max-h-50' : 'max-h-100',
                    kind(item) === 'video' && 'aspect-video bg-black'
                  )}
                />
                <Overlay item={item} />
              </button>
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t px-2 py-1.5 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">{item.label}</span>
                {item.details && <span className="tabular-nums">{item.details}</span>}
              </div>
              <a
                href={item.url}
                download={item.filename}
                className="absolute right-2 top-2 z-10 inline-flex size-8 items-center justify-center rounded-md bg-black/60 text-white transition-opacity hover:bg-black/80 focus:opacity-100 group-focus-within:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                title={labels.download(item.label)}
                aria-label={labels.download(item.label)}
              >
                <Download className="size-4" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}
      {media.length > 0 && variant === 'compact' && (
        <ul className="grid min-w-0 grid-cols-1 gap-3 text-left sm:grid-cols-2">
          {media.map((item) => (
            <li key={item.id} className="min-w-0 space-y-2">
              <button
                type="button"
                onClick={() => open(item)}
                aria-label={triggerLabel(item)}
                className={cn(
                  'group relative block w-full overflow-hidden rounded-md',
                  kind(item) === 'video' ? 'cursor-pointer' : 'cursor-zoom-in'
                )}
              >
                <Preview
                  item={item}
                  className={cn(
                    'max-h-48 w-full rounded-md border bg-muted object-contain',
                    kind(item) === 'video' && 'aspect-video bg-black'
                  )}
                />
                <Overlay item={item} className="rounded-md" />
              </button>
              <a
                href={item.url}
                download={item.filename}
                aria-label={labels.download(item.label)}
                className="flex min-w-0 items-center gap-2 text-xs underline-offset-2 opacity-90 hover:underline"
              >
                <Download className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {media.length > 0 && variant === 'strip' && (
        <ul className="flex flex-wrap gap-2">
          {media.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                title={item.label}
                aria-label={triggerLabel(item)}
                onClick={() => open(item)}
                className={cn(
                  'group relative block h-16 w-28 overflow-hidden rounded-md border bg-muted',
                  kind(item) === 'video' ? 'cursor-pointer' : 'cursor-zoom-in'
                )}
              >
                <Preview item={item} className="size-full object-cover object-top" />
                {kind(item) === 'video' ? (
                  <Overlay item={item} />
                ) : (
                  <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((item) => (
            <li key={item.id}>
              <Button asChild variant="outline" size="sm" className="h-8 gap-2 font-normal">
                <a
                  href={item.url}
                  download={item.filename}
                  aria-label={labels.download(item.label)}
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="max-w-48 truncate">{item.label}</span>
                  {item.details && (
                    <span className="text-xs text-muted-foreground">{item.details}</span>
                  )}
                </a>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ImageLightbox
        image={image && { url: image.url, filename: image.filename }}
        onClose={() => setImage(null)}
        labels={labels.image}
      />
      <VideoLightbox
        video={video && { url: video.url, filename: video.filename }}
        onClose={() => setVideo(null)}
        labels={labels.video}
      />
    </div>
  );
}
