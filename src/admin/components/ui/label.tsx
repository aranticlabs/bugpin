import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/utils';

const labelVariants = cva(
  'text-sm font-medium leading-none peer-disabled:pointer-events-none peer-disabled:opacity-70'
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, onClick, ...props }, ref) => {
  const handleClick = (event: React.MouseEvent<HTMLLabelElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;

    const htmlFor = event.currentTarget.getAttribute('for');
    if (!htmlFor) return;

    const target = document.getElementById(htmlFor);
    if (target?.getAttribute('role') === 'switch') {
      event.preventDefault();
    }
  };

  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(labelVariants(), className)}
      onClick={handleClick}
      {...props}
    />
  );
});
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
