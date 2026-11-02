import { FunctionComponent, JSX } from 'preact';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border border-solid border-transparent px-2.5 py-0.5 text-xs font-semibold',
  {
    variants: {
      variant: {
        secondary: 'bg-muted text-foreground',
        destructive: 'bg-destructive text-destructive-foreground',
      },
    },
    defaultVariants: {
      variant: 'secondary',
    },
  }
);

export interface BadgeProps
  extends JSX.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  class?: string;
}

export const Badge: FunctionComponent<BadgeProps> = ({ class: className, variant, ...props }) => {
  return <span class={cn(badgeVariants({ variant }), className)} {...props} />;
};
