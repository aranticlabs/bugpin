import { FunctionComponent } from 'preact';
import { useState, useCallback, useRef } from 'preact/hooks';
import { cn } from '../lib/utils';
import { Button } from './ui';

export interface CapturedMedia {
  id: string;
  dataUrl: string;
  timestamp: Date;
  annotated: boolean;
  mimeType: string;
  width?: number;
  height?: number;
  annotations?: object;
}

interface ScreenshotManagerProps {
  media: CapturedMedia[];
  onCapture: () => void;
  onUpload: (item: CapturedMedia) => void;
  onRemove: (id: string) => void;
  onAnnotate: (id: string) => void;
  isCapturing: boolean;
  enableAnnotation: boolean;
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];

export const ScreenshotManager: FunctionComponent<ScreenshotManagerProps> = ({
  media,
  onCapture,
  onUpload,
  onRemove,
  onAnnotate,
  isCapturing,
  enableAnnotation,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isVideo = (mimeType: string) => mimeType.startsWith('video/');
  const isImage = (mimeType: string) => mimeType.startsWith('image/');

  const validateFile = useCallback((file: File): string | null => {
    if (isImage(file.type)) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        return `Unsupported image format: ${file.type}`;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        return `Image too large. Maximum size is 10MB.`;
      }
    } else if (isVideo(file.type)) {
      if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
        return `Unsupported video format: ${file.type}`;
      }
      if (file.size > MAX_VIDEO_SIZE) {
        return `Video too large. Maximum size is 50MB.`;
      }
    } else {
      return `Unsupported file type: ${file.type}`;
    }
    return null;
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      const error = validateFile(file);
      if (error) {
        setUploadError(error);
        return;
      }

      setUploadError(null);

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;

        if (isImage(file.type)) {
          const img = new Image();
          img.onload = () => {
            const item: CapturedMedia = {
              id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              dataUrl,
              timestamp: new Date(),
              annotated: false,
              mimeType: file.type,
              width: img.width,
              height: img.height,
            };
            onUpload(item);
          };
          img.src = dataUrl;
        } else if (isVideo(file.type)) {
          const video = document.createElement('video');
          video.onloadedmetadata = () => {
            const item: CapturedMedia = {
              id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              dataUrl,
              timestamp: new Date(),
              annotated: false,
              mimeType: file.type,
              width: video.videoWidth,
              height: video.videoHeight,
            };
            onUpload(item);
          };
          video.src = dataUrl;
        }
      };
      reader.readAsDataURL(file);
    },
    [validateFile, onUpload],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (files) {
        for (let i = 0; i < files.length; i++) {
          await processFile(files[i]);
        }
      }
    },
    [processFile],
  );

  const handleFileInput = useCallback(
    async (e: Event) => {
      const input = e.target as HTMLInputElement;
      const files = input.files;
      if (files) {
        for (let i = 0; i < files.length; i++) {
          await processFile(files[i]);
        }
      }
      input.value = '';
    },
    [processFile],
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div class="flex flex-col gap-4">
      {/* Privacy notice */}
      <p class="text-xs text-muted-foreground">
        Tip: Use the annotation tool to hide any sensitive data before submitting.
      </p>

      {/* Action button */}
      <div class="flex gap-2">
        <Button class="flex-1" onClick={onCapture} disabled={isCapturing}>
          <svg class="w-4.5 h-4.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 15.2c1.77 0 3.2-1.43 3.2-3.2S13.77 8.8 12 8.8 8.8 10.23 8.8 12s1.43 3.2 3.2 3.2zM9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"
              fill="currentColor"
            />
          </svg>
          {isCapturing ? 'Capturing...' : 'Capture Screenshot'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
      </div>

      {/* Error message */}
      {uploadError && (
        <div class="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-solid border-red-200 rounded text-red-600 text-sm">
          <svg
            class="w-4.5 h-4.5 flex-shrink-0"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
              fill="currentColor"
            />
          </svg>
          {uploadError}
        </div>
      )}

      {/* Drop zone / Media grid */}
      <div
        class={cn(
          'min-h-40 border-2 border-dashed border-border rounded bg-muted transition-colors',
          isDragging && 'border-primary bg-primary/5',
          media.length > 0 && 'border-solid bg-background min-h-0',
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {media.length === 0 ? (
          <div
            class="flex flex-col items-center justify-center py-8 px-4 text-gray-500 text-center cursor-pointer transition-colors hover:text-primary [&_svg]:hover:text-primary"
            onClick={handleUploadClick}
          >
            <svg
              class="w-12 h-12 mb-3 text-gray-400 transition-colors"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"
                fill="currentColor"
              />
            </svg>
            <p class="text-sm font-medium mb-1">Drag and drop files here</p>
            <span class="text-xs text-gray-400">or click to browse</span>
          </div>
        ) : (
          <div class="grid grid-cols-2 gap-3 p-3">
            {media.map((item) => (
              <div
                key={item.id}
                class="relative rounded overflow-hidden bg-background border border-solid border-border"
              >
                <div class="relative aspect-video bg-gray-800">
                  {isVideo(item.mimeType) ? (
                    <video class="w-full h-full object-contain" src={item.dataUrl} muted />
                  ) : (
                    <img class="w-full h-full object-contain" src={item.dataUrl} alt="Screenshot" />
                  )}
                  {/* Badges */}
                  <div class="absolute top-1.5 left-1.5 flex gap-1">
                    {item.annotated && (
                      <span class="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-blue-100 text-blue-700">
                        Annotated
                      </span>
                    )}
                    {isVideo(item.mimeType) && (
                      <span class="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-gray-200 text-gray-700">
                        Video
                      </span>
                    )}
                  </div>
                </div>
                <div class="flex justify-between px-2 py-1.5 text-xs text-gray-500 border-t border-solid border-gray-200">
                  <span>{formatTimestamp(item.timestamp)}</span>
                  {item.width && item.height && (
                    <span>
                      {item.width} x {item.height}
                    </span>
                  )}
                </div>
                <div class="flex gap-1 px-2 py-1.5 border-t border-solid border-gray-200 bg-gray-50">
                  {enableAnnotation && isImage(item.mimeType) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      class="w-7 h-7 bg-white hover:bg-gray-200"
                      onClick={() => onAnnotate(item.id)}
                      title="Annotate"
                    >
                      <svg class="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 000-1.41l-2.34-2.34a.996.996 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                          fill="currentColor"
                        />
                      </svg>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    class="w-7 h-7 bg-white hover:bg-red-50 hover:text-red-600"
                    onClick={() => onRemove(item.id)}
                    title="Remove"
                  >
                    <svg class="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                        fill="currentColor"
                      />
                    </svg>
                  </Button>
                </div>
              </div>
            ))}
            {/* Drop more area as a grid item */}
            <div
              class="flex flex-col items-center justify-center gap-2 min-h-28 border-2 border-dashed border-border rounded bg-muted cursor-pointer transition-colors hover:border-primary hover:bg-primary/5 [&_svg]:hover:text-primary [&_span]:hover:text-primary"
              onClick={handleUploadClick}
            >
              <svg
                class="w-8 h-8 text-gray-400 transition-colors"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor" />
              </svg>
              <span class="text-xs text-gray-400 transition-colors">Add more</span>
            </div>
          </div>
        )}
      </div>

      {/* Helper text */}
      <p class="text-xs text-gray-400 text-center">
        Supported: PNG, JPG, GIF, WebP (max 10MB) - MP4, WebM, MOV, AVI (max 50MB)
      </p>
    </div>
  );
};
