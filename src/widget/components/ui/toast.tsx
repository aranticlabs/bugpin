import { FunctionComponent } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { cn } from '../../lib/utils';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
  // Top-layer toasts stay out of tab recordings that use Element Capture.
  topLayer?: boolean;
}

const toastVariants: Record<ToastType, string> = {
  success:
    'bg-[color-mix(in_srgb,var(--success)_10%,var(--background))] border-success/30 text-success',
  error:
    'bg-[color-mix(in_srgb,var(--destructive)_10%,var(--background))] border-destructive/30 text-destructive',
  info: 'bg-[color-mix(in_srgb,var(--info)_10%,var(--background))] border-info/30 text-info',
};

export const Toast: FunctionComponent<ToastProps> = ({
  message,
  type,
  onClose,
  duration = 5000,
  topLayer = false,
}) => {
  const toastRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  useEffect(() => {
    if (topLayer) toastRef.current?.showPopover?.();
  }, [topLayer]);

  return (
    <div
      ref={toastRef}
      popover={topLayer ? 'manual' : undefined}
      class={cn(
        'fixed inset-auto bottom-20 right-5 z-top flex items-center gap-3 px-5 py-4 border border-solid rounded text-sm shadow-lg animate-[slideIn_0.3s_ease-out]',
        topLayer && 'm-0',
        toastVariants[type]
      )}
      role="alert"
      aria-live="polite"
    >
      {type === 'success' && (
        <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
            fill="currentColor"
          />
        </svg>
      )}
      {type === 'error' && (
        <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
            fill="currentColor"
          />
        </svg>
      )}
      {type === 'info' && (
        <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
            fill="currentColor"
          />
        </svg>
      )}
      <span>{message}</span>
    </div>
  );
};
