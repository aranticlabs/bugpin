import type { KeyboardEvent, ReactNode } from 'react';
import { Camera } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * Clickable image preview that opens an upload dialog. Rendered as a div with a button role
 * because the previews contain block content, which a native button may not hold.
 */
export function ImageUploadTile({
  label,
  onActivate,
  shape = 'rounded',
  className,
  children,
}: {
  label: string;
  onActivate: () => void;
  shape?: 'rounded' | 'circle';
  className?: string;
  children: ReactNode;
}) {
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-lg';
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onActivate}
      onKeyDown={handleKeyDown}
      className={cn('group relative cursor-pointer focus-visible:focus-ring', radius, className)}
    >
      {children}
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
          radius
        )}
      >
        <Camera className="size-6 text-white" />
      </div>
    </div>
  );
}
