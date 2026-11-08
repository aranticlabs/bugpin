import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Button } from '../ui/button';
import { SettingsCard } from '../ui/settings-card';
import type { Confirmation } from './ConfirmActionDialog';
import { useUserMutation } from './useUserMutation';
import type { User } from '@shared/types';

export function UserDeleteSection({
  user,
  isSelf,
  confirm,
}: {
  user: User;
  isSelf: boolean;
  confirm: (confirmation: Confirmation) => void;
}) {
  const navigate = useNavigate();
  const remove = useUserMutation(
    () => api.delete(`/users/${user.id}`),
    'User deleted',
    'Failed to delete the user',
    () => navigate('/settings/users')
  );

  return (
    <SettingsCard title="Delete User" description="Removes the account. Reports they created stay.">
      <Button
        variant="destructive"
        disabled={isSelf || remove.isPending}
        onClick={() =>
          confirm({
            title: 'Delete user',
            description: `Delete ${user.name} (${user.email})? This cannot be undone.`,
            action: 'Delete',
            destructive: true,
            onConfirm: () => remove.mutate(undefined),
          })
        }
      >
        Delete User
      </Button>
      {isSelf && (
        <p className="mt-2 text-xs text-muted-foreground">You cannot delete your own account.</p>
      )}
    </SettingsCard>
  );
}
