import type { User, UserRole } from '@shared/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { ROLE_LABELS } from './userHelpers';

export interface Confirmation {
  title: string;
  description: string;
  action: string;
  destructive?: boolean;
  onConfirm: () => void;
}

const ROLE_SUMMARIES: Record<UserRole, string> = {
  admin: 'Admins have full access, including all settings and user management.',
  editor: 'Editors work on reports but cannot change settings or manage users.',
  viewer: 'Viewers have read-only access.',
};

export function roleChangeConfirmation(
  user: User,
  role: UserRole,
  onConfirm: () => void
): Confirmation {
  return {
    title: 'Change role',
    description: `${user.name} changes from ${ROLE_LABELS[user.role]} to ${ROLE_LABELS[role]}. ${ROLE_SUMMARIES[role]}`,
    action: 'Change Role',
    destructive: user.role === 'admin',
    onConfirm,
  };
}

export function deactivateConfirmation(user: User, onConfirm: () => void): Confirmation {
  return {
    title: 'Deactivate user',
    description: `${user.name} (${user.email}) can no longer sign in or use API tokens. You can reactivate them at any time.`,
    action: 'Deactivate',
    destructive: true,
    onConfirm,
  };
}

export function ConfirmActionDialog({
  confirmation,
  onClose,
}: {
  confirmation: Confirmation | null;
  onClose: () => void;
}) {
  return (
    <AlertDialog open={!!confirmation} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirmation?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={confirmation?.destructive ? 'outline-destructive' : 'default'}
            onClick={() => {
              confirmation?.onConfirm();
              onClose();
            }}
          >
            {confirmation?.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
