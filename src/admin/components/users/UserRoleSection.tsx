import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { SettingsCard } from '../ui/settings-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  deactivateConfirmation,
  roleChangeConfirmation,
  type Confirmation,
} from './ConfirmActionDialog';
import { DefaultProjectList } from './DefaultProjectList';
import {
  ROLE_LABELS,
  USER_ROLES,
  canReceiveDefaultProjects,
  isPendingInvitation,
  toUserRole,
} from './userHelpers';
import { useUpdateUser } from './useUsers';
import type { User } from '@shared/types';

export function UserRoleSection({
  user,
  isSelf,
  confirm,
}: {
  user: User;
  isSelf: boolean;
  confirm: (confirmation: Confirmation) => void;
}) {
  const pending = isPendingInvitation(user);
  const update = useUpdateUser();
  const locked = isSelf || pending || update.isPending;

  return (
    <SettingsCard title="Role and Access" description="What this user can see and do">
      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="user-role">Role</Label>
          <Select
            value={user.role}
            onValueChange={(value) => {
              const role = toUserRole(value);
              if (!role || role === user.role) return;
              confirm(
                roleChangeConfirmation(user, role, () => update.mutate({ id: user.id, role }))
              );
            }}
            disabled={locked}
          >
            <SelectTrigger id="user-role" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {USER_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isSelf && (
            <p className="text-xs text-muted-foreground">You cannot change your own role.</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="user-active">Active</Label>
            <p className="text-xs text-muted-foreground">
              Inactive users cannot sign in or use API tokens.
            </p>
          </div>
          <Switch
            id="user-active"
            checked={user.isActive}
            onCheckedChange={(isActive) => {
              if (isActive) {
                update.mutate({ id: user.id, isActive });
                return;
              }
              confirm(
                deactivateConfirmation(user, () => update.mutate({ id: user.id, isActive: false }))
              );
            }}
            disabled={locked}
          />
        </div>

        <fieldset className="min-w-0 space-y-2">
          <legend className="text-sm font-medium leading-none">Default Projects</legend>
          <p className="text-xs text-muted-foreground">
            New reports from selected projects are assigned to {user.name}.
            {!canReceiveDefaultProjects(user) &&
              ' The user must be active and have accepted their invitation before new projects can be added.'}
          </p>
          <DefaultProjectList user={user} className="max-h-60 rounded-md border" />
        </fieldset>
      </div>
    </SettingsCard>
  );
}
