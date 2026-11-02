import { ComponentChildren, FunctionComponent, JSX } from 'preact';

export type TooltipSide = 'top' | 'bottom';

export function sideStyle(side: TooltipSide, offset: number): JSX.CSSProperties {
  return {
    left: '50%',
    // Tailwind's translate utilities rely on @property defaults, which do not apply in a shadow root.
    transform: 'translateX(-50%)',
    ...(side === 'top'
      ? { bottom: `calc(100% + ${offset}px)` }
      : { top: `calc(100% + ${offset}px)` }),
  };
}

export interface TooltipProps {
  content: string;
  side?: TooltipSide;
  children: ComponentChildren;
}

export const Tooltip: FunctionComponent<TooltipProps> = ({ content, side = 'top', children }) => {
  return (
    <div class="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        class="pointer-events-none invisible absolute z-20 whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground group-hover/tooltip:visible group-focus-within/tooltip:visible"
        style={sideStyle(side, 6)}
      >
        {content}
      </span>
    </div>
  );
};
