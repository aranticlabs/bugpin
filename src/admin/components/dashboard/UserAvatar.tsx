import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { initials } from '../../lib/dashboard';

const SIZES = {
  sm: { avatar: 'size-6', fallback: 'text-2xs' },
  md: { avatar: 'size-8', fallback: 'text-xs' },
} as const;

export function UserAvatar({
  name,
  avatarUrl,
  size = 'sm',
  showName = false,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: keyof typeof SIZES;
  /** Shows the name as a native tooltip, for avatars that appear without a visible name. */
  showName?: boolean;
}) {
  return (
    <Avatar className={SIZES[size].avatar} title={showName ? name : undefined}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
      <AvatarFallback className={SIZES[size].fallback}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
