import { X } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

export function NoticeControls({
  onSnooze,
  onDismiss,
  dismissLabel,
  small = false,
}: {
  onSnooze: () => void;
  onDismiss: () => void;
  dismissLabel: string;
  small?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <TooltipProvider>
        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onSnooze} className="h-6 px-2 text-xs">
              Not now
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remind me tomorrow</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className={cn('shrink-0 text-muted-foreground', small ? 'h-5 w-5' : 'h-6 w-6')}
      >
        <X />
      </Button>
    </div>
  );
}
