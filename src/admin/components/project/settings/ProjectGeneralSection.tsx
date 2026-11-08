import { Avatar, AvatarFallback, AvatarImage } from '../../ui/avatar';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { SettingsCard } from '../../ui/settings-card';
import { ProjectWhitelistForm } from '../ProjectWhitelistForm';
import type { ProjectSettingsForm, UpdateProjectSettingsForm } from './projectSettingsForm';
import type { AssignableUser } from './useProjectSettingsForm';

const UNASSIGNED_VALUE = '__unassigned__';

export function ProjectGeneralSection({
  form,
  update,
  assignableUsers,
}: {
  form: ProjectSettingsForm;
  update: UpdateProjectSettingsForm;
  assignableUsers: AssignableUser[] | undefined;
}) {
  const { defaultAssigneeUserId } = form;
  const assignableUserIds = new Set(assignableUsers?.map((user) => user.id) ?? []);
  const isMissingAssignedUser =
    !!defaultAssigneeUserId && !assignableUserIds.has(defaultAssigneeUserId);
  const selectedAssignee = assignableUsers?.find((user) => user.id === defaultAssigneeUserId);

  return (
    <>
      <SettingsCard
        title="Default Assignee"
        description="New reports from this project are assigned automatically to this user."
      >
        <div className="space-y-5">
          <Label htmlFor="default-assignee" className="sr-only">
            Default Assignee
          </Label>

          <div className="rounded-lg border bg-muted/30 p-4">
            {selectedAssignee ? (
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  {selectedAssignee.avatarUrl ? (
                    <AvatarImage src={selectedAssignee.avatarUrl} alt={selectedAssignee.name} />
                  ) : null}
                  <AvatarFallback>{selectedAssignee.name.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-medium">{selectedAssignee.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{selectedAssignee.email}</p>
                </div>
              </div>
            ) : isMissingAssignedUser ? (
              <div className="space-y-1">
                <p className="font-medium">Current assignee unavailable</p>
                <p className="text-sm text-muted-foreground">
                  This user can no longer receive default assignments for new reports.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="font-medium">No default assignee</p>
                <p className="text-sm text-muted-foreground">
                  New reports stay unassigned until somebody picks them up manually.
                </p>
              </div>
            )}
          </div>

          <Select
            value={defaultAssigneeUserId ?? UNASSIGNED_VALUE}
            onValueChange={(value) =>
              update({ defaultAssigneeUserId: value === UNASSIGNED_VALUE ? null : value })
            }
          >
            <SelectTrigger id="default-assignee" className="h-11 max-w-xl">
              <SelectValue placeholder="Choose a default assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED_VALUE}>No default assignee</SelectItem>
              {isMissingAssignedUser && defaultAssigneeUserId ? (
                <SelectItem value={defaultAssigneeUserId}>
                  Unavailable user (current setting)
                </SelectItem>
              ) : null}
              {assignableUsers?.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isMissingAssignedUser ? (
            <p className="text-sm text-warning">
              The current default assignee is no longer assignable. New reports stay unassigned
              until you choose another user.
            </p>
          ) : null}
        </div>
      </SettingsCard>
      <SettingsCard
        title="Allowed Domains"
        description="Only websites from these domains can use the project's widget."
      >
        <ProjectWhitelistForm
          value={form.whitelistSettings}
          onChange={(whitelistSettings) => update({ whitelistSettings })}
        />
      </SettingsCard>
    </>
  );
}
