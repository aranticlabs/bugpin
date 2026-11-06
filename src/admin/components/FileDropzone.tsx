import { useEffect, useRef, useState, type DragEvent } from 'react';
import { FileText, Film, Plus, Trash2, Upload } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

function matchesAccept(file: File, accept: string): boolean {
  const tokens = accept
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith('.')) return name.endsWith(token);
    if (token.endsWith('/*')) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
}

function sameFile(a: File, b: File): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FilePreview({ file }: { file: File }) {
  const isImage = file.type.startsWith('image/');
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, isImage]);

  if (isImage && url) {
    return <img src={url} alt="" className="h-full w-full object-cover" />;
  }
  const Icon = file.type.startsWith('video/') ? Film : FileText;
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

export function FileDropzone({
  id,
  files,
  onChange,
  accept,
  helperText,
  disabled = false,
}: {
  id?: string;
  files: File[];
  onChange: (files: File[]) => void;
  accept: string;
  helperText?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Counts nested dragenter and dragleave events so moving over child elements keeps the highlight.
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);

  const addFiles = (incoming: File[]) => {
    const accepted = incoming.filter((file) => matchesAccept(file, accept));
    setRejected(incoming.filter((file) => !matchesAccept(file, accept)).map((file) => file.name));
    const fresh = accepted.filter((file) => !files.some((existing) => sameFile(existing, file)));
    if (fresh.length > 0) onChange([...files, ...fresh]);
  };

  const openPicker = () => inputRef.current?.click();

  const onDragEnter = (event: DragEvent) => {
    event.preventDefault();
    if (disabled) return;
    dragDepth.current += 1;
    setIsDragging(true);
  };
  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
  };
  const onDragLeave = (event: DragEvent) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (disabled) return;
    addFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="file-dropzone-input"
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <div
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'rounded-md transition-colors',
          files.length === 0 &&
            'border-2 border-dashed border-border bg-muted/50 hover:border-primary hover:bg-primary/5',
          isDragging && 'border-2 border-dashed border-primary bg-primary/5'
        )}
      >
        {files.length === 0 ? (
          <button
            id={id}
            type="button"
            onClick={openPicker}
            disabled={disabled}
            className="group flex w-full flex-col items-center justify-center px-4 py-8 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload
              className="mb-3 h-10 w-10 text-muted-foreground transition-colors group-hover:text-primary"
              aria-hidden="true"
            />
            <span className="mb-1 text-sm font-medium text-foreground">
              Drag and drop files here
            </span>
            <span className="text-xs text-muted-foreground">or click to browse</span>
          </button>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Selected files">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${file.size}-${file.lastModified}`}
                className="overflow-hidden rounded-md border bg-background"
              >
                <div className="relative aspect-video bg-muted">
                  <FilePreview file={file} />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="absolute right-1.5 top-1.5 h-7 w-7 p-0 hover:text-destructive"
                    onClick={() => onChange(files.filter((_, current) => current !== index))}
                    disabled={disabled}
                    aria-label={`Remove ${file.name}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2 border-t px-2 py-1.5 text-xs text-muted-foreground">
                  <span className="truncate" title={file.name}>
                    {file.name}
                  </span>
                  <span className="shrink-0 tabular-nums">{formatFileSize(file.size)}</span>
                </div>
              </li>
            ))}
            <li>
              <button
                id={id}
                type="button"
                onClick={openPicker}
                disabled={disabled}
                className="group flex h-full min-h-28 w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-muted/50 transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus
                  className="h-7 w-7 text-muted-foreground transition-colors group-hover:text-primary"
                  aria-hidden="true"
                />
                <span className="text-xs text-muted-foreground transition-colors group-hover:text-primary">
                  Add more files
                </span>
              </button>
            </li>
          </ul>
        )}
      </div>
      {rejected.length > 0 && (
        <p className="text-xs text-destructive" role="alert">
          Not supported, so not added: {rejected.join(', ')}
        </p>
      )}
      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
    </div>
  );
}
