import type { User, UserRole } from '@shared/types';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

export const USER_ROLES: UserRole[] = ['admin', 'editor', 'viewer'];

export function toUserRole(value: string): UserRole | undefined {
  return USER_ROLES.find((role) => role === value);
}

export function isPendingInvitation(user: Pick<User, 'invitationSentAt' | 'invitationAcceptedAt'>) {
  return !!(user.invitationSentAt && !user.invitationAcceptedAt);
}

/** Only active users who accepted their invitation can be added to new default projects. */
export function canReceiveDefaultProjects(user: User): boolean {
  return user.isActive && !isPendingInvitation(user);
}
