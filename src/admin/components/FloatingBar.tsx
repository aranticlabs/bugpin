import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';

const FloatingBarSlotContext = createContext<HTMLElement | null>(null);

/**
 * Hosts floating bars over the bottom of its content. The bars float above the content instead of
 * taking room in it, so showing one never moves the page.
 */
export function FloatingBarArea({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  return (
    <FloatingBarSlotContext.Provider value={slot}>
      {children}
      <div
        ref={setSlot}
        className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex flex-col items-center gap-2 px-4"
      />
    </FloatingBarSlotContext.Provider>
  );
}

/**
 * A bar floating over the bottom of the page content. Outside a FloatingBarArea it
 * sticks to the bottom of its scroll container instead.
 */
export function FloatingBar({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const slot = useContext(FloatingBarSlotContext);
  const bar = (
    <div
      role="region"
      aria-label={label}
      className={cn(
        'pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-xl border bg-popover py-2 pl-5 pr-2 shadow-lg',
        className
      )}
    >
      {children}
    </div>
  );
  if (slot) return createPortal(bar, slot);
  return (
    <div className="pointer-events-none sticky bottom-6 z-20 flex justify-center px-4">{bar}</div>
  );
}
