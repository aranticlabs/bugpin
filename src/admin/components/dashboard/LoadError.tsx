import { AlertCircle, RotateCw } from 'lucide-react';
import { Button } from '../ui/button';

/** Shown in place of a card's content when its data failed to load */
export function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <AlertCircle className="size-8 text-destructive" aria-hidden />
      <p className="font-medium">Couldn&apos;t load {what}</p>
      <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
      <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
        <RotateCw />
        Retry
      </Button>
    </div>
  );
}
