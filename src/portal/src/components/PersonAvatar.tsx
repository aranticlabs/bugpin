import { User } from 'lucide-react';
import { Avatar, AvatarFallback } from '@shared-ui/components/ui/avatar';
import { cn } from '@shared-ui/lib/utils';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toUpperCase() ?? '')
    .join('');
}

export function PersonAvatar({
  name,
  team = false,
  className,
}: {
  name: string;
  team?: boolean;
  className?: string;
}) {
  const letters = initials(name);
  return (
    <Avatar className={cn('h-8 w-8', className)} aria-hidden>
      <AvatarFallback
        className={cn('text-xs font-medium', team && 'bg-primary text-primary-foreground')}
      >
        {letters || <User className="size-1/2" />}
      </AvatarFallback>
    </Avatar>
  );
}
