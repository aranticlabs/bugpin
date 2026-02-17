import { FunctionComponent, JSX } from 'preact';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-medium font-sans cursor-pointer transition-colors border-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-hover-foreground',
        outline: 'border border-solid border-input bg-background text-foreground hover:bg-muted',
        ghost: 'bg-transparent hover:bg-muted text-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        default: 'h-10 px-4 text-sm rounded-sm',
        sm: 'h-8 px-3 text-xs rounded-sm',
        lg: 'h-12 px-6 text-base rounded',
        icon: 'h-8 w-8 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'size'>, VariantProps<typeof buttonVariants> {
  class?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

export const Button: FunctionComponent<ButtonProps> = ({
  class: className,
  variant,
  size,
  children,
  type = 'button',
  ...props
}) => {
  return (
    <button type={type} class={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </button>
  );
};

export { buttonVariants };
