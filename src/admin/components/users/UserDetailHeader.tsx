import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { ROLE_LABELS, isPendingInvitation } from './userHelpers';
import type { User } from '@shared/types';

export function UserDetailHeader({ user, isSelf }: { user: User; isSelf: boolean }) {
  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-14 w-14">
        {user.avatarUrl ? (
          <AvatarImage src={user.avatarUrl} alt={user.name} />
        ) : (
          <AvatarFallback className="bg-brand-subtle text-lg text-brand-subtle-foreground">
            {user.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        )}
      </Avatar>
      <div className="min-w-0 space-y-1">
        <h2 className="truncate text-xl font-semibold">{user.name}</h2>
        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
          {isPendingInvitation(user) ? (
            <Badge variant="outline" className="status-pending">
              Pending
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className={user.isActive ? 'status-active' : 'status-inactive'}
            >
              {user.isActive ? 'Active' : 'Inactive'}
            </Badge>
          )}
          {user.twoFactorEnabled && <Badge variant="secondary">2FA</Badge>}
          {isSelf && <Badge variant="outline">You</Badge>}
        </div>
      </div>
    </div>
  );
}
