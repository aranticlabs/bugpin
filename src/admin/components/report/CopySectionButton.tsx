import { useState } from 'react';
import { Button } from '../ui/button';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

interface CopySectionButtonProps {
  label: string;
  getContent: () => string;
  className?: string;
}

export function CopySectionButton({ label, getContent, className }: CopySectionButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const content = getContent();
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success(`Copied ${label}`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleClick}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label={`Copy ${label}`}
            className={cn('text-muted-foreground hover:text-foreground', className)}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{copied ? 'Copied' : `Copy ${label}`}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
