import type { UserRole } from './types';

export type GamificationStatus = 'on' | 'off' | 'opted-out' | 'viewer' | 'workspace-off';

export interface GamificationStatusInput {
  role: UserRole;
  /** The admin switch for this user */
  enabled: boolean;
  optedOut: boolean;
}

export interface GamificationWorkspaceRules {
  enabled: boolean;
  allowOptOut: boolean;
}

/**
 * Whether someone takes part in gamification. Viewers never do. An opt-out only counts while
 * the workspace allows opting out.
 */
export function gamificationStatus(
  user: GamificationStatusInput,
  workspace: GamificationWorkspaceRules
): GamificationStatus {
  if (user.role === 'viewer') return 'viewer';
  if (!workspace.enabled) return 'workspace-off';
  if (!user.enabled) return 'off';
  return workspace.allowOptOut && user.optedOut ? 'opted-out' : 'on';
}
