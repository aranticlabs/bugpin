import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { SettingsCard } from '../ui/settings-card';
import { UnsavedChangesGuard } from '../UnsavedChangesGuard';
import { useUserMutation } from './useUserMutation';
import type { User } from '@shared/types';

const NAME_MIN_LENGTH = 2;

export function UserAccountSection({ user }: { user: User }) {
  const [name, setName] = useState(user.name);
  useEffect(() => setName(user.name), [user.name]);
  const trimmed = name.trim();
  const isDirty = trimmed !== user.name;
  const nameError =
    isDirty && trimmed.length < NAME_MIN_LENGTH
      ? `Name must be at least ${NAME_MIN_LENGTH} characters`
      : null;
  const save = useUserMutation(
    () => api.patch(`/users/${user.id}`, { name: trimmed }),
    'Name updated',
    'Failed to update the name'
  );

  return (
    <SettingsCard title="Account" description="Name shown to the team and in notifications">
      <UnsavedChangesGuard
        isDirty={isDirty}
        onSave={async () => !nameError && save.mutateAsync(undefined)}
        onDiscard={() => setName(user.name)}
      />
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="user-name">Name</Label>
          <Input
            id="user-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!nameError}
            aria-describedby={nameError ? 'user-name-error' : undefined}
          />
          {nameError && (
            <p id="user-name-error" className="text-xs text-destructive">
              {nameError}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-email">Email Address</Label>
          <Input id="user-email" value={user.email} disabled />
          <p className="text-xs text-muted-foreground">
            Users change their own email address in their profile.
          </p>
        </div>
      </div>
    </SettingsCard>
  );
}
