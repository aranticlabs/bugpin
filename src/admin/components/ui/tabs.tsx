import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/utils';

const Tabs = TabsPrimitive.Root;

const tabsListVariants = cva('inline-flex items-center text-muted-foreground', {
  variants: {
    variant: {
      default: 'h-9 justify-center rounded-lg bg-muted p-1',
      line: [
        'h-auto w-full justify-start gap-4 overflow-x-auto rounded-none bg-transparent p-0 shadow-[inset_0_-1px_0_var(--border)]',
        '[&>button]:shrink-0 [&>button]:rounded-none [&>button]:border-b-2 [&>button]:border-transparent [&>button]:px-0 [&>button]:py-2',
        '[&>button]:hover:text-foreground [&>button]:focus-visible:ring-inset [&>button]:focus-visible:ring-offset-0',
        '[&>button[data-state=active]]:border-primary [&>button[data-state=active]]:bg-transparent [&>button[data-state=active]]:shadow-none',
      ],
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>
>(({ className, variant, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(tabsListVariants({ variant }), className)}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, onMouseDown, onKeyDown, onBlur, ...props }, ref) => (
  // Radix focuses the trigger from script on mousedown, which Chrome reports as :focus-visible.
  // The data attribute marks pointer focus so the keyboard focus ring is not drawn after a click.
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:focus-ring [&[data-pointer-focus]:focus-visible]:ring-0 [&[data-pointer-focus]:focus-visible]:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow',
      className
    )}
    onMouseDown={(event) => {
      event.currentTarget.dataset.pointerFocus = '';
      onMouseDown?.(event);
    }}
    onKeyDown={(event) => {
      delete event.currentTarget.dataset.pointerFocus;
      onKeyDown?.(event);
    }}
    onBlur={(event) => {
      delete event.currentTarget.dataset.pointerFocus;
      onBlur?.(event);
    }}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('mt-2 focus-visible:focus-ring data-[state=inactive]:hidden', className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
