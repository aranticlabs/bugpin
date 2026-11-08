import { useState, type ReactNode } from 'react';
import { api } from '../../api/client';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { SettingsCard } from '../ui/settings-card';
import { Spinner } from '../ui/spinner';
import type { Confirmation } from './ConfirmActionDialog';
import { TemporaryPasswordDialog } from './TemporaryPasswordDialog';
import { isPendingInvitation } from './userHelpers';
import { useUserMutation } from './useUserMutation';
import type { User } from '@shared/types';

function ActionRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function UserSignInSection({
  user,
  isSelf,
  confirm,
}: {
  user: User;
  isSelf: boolean;
  confirm: (confirmation: Confirmation) => void;
}) {
  const [temporaryOpen, setTemporaryOpen] = useState(false);
  const pending = isPendingInvitation(user);
  const sendReset = useUserMutation(
    () => api.post(`/users/${user.id}/password-reset-email`),
    `Password reset email sent to ${user.email}`,
    'Failed to send the password reset email'
  );
  const resendInvitation = useUserMutation(
    () => api.post(`/users/${user.id}/resend-invitation`),
    `Invitation sent to ${user.email}`,
    'Failed to resend the invitation'
  );
  const resetTwoFactor = useUserMutation(
    () => api.delete(`/users/${user.id}/two-factor`),
    'Two-factor authentication reset',
    'Failed to reset two-factor authentication'
  );
  const signOut = useUserMutation(
    () => api.delete(`/users/${user.id}/sessions`),
    `${user.name} was signed out everywhere`,
    'Failed to sign the user out'
  );

  return (
    <SettingsCard
      title="Sign-in and Security"
      description="Help this user sign in and end access when needed"
    >
      <div className="space-y-4">
        {pending ? (
          <ActionRow
            title="Invitation pending"
            description="The user has not accepted their invitation yet."
          >
            <Button
              variant="outline"
              onClick={() => resendInvitation.mutate(undefined)}
              disabled={resendInvitation.isPending}
            >
              {resendInvitation.isPending && <Spinner size="sm" className="mr-2" />}
              Resend Invitation
            </Button>
          </ActionRow>
        ) : (
          <>
            <ActionRow
              title="Send password reset email"
              description="Emails a link to choose a new password. The link works once and expires after 24 hours. Using it revokes their API tokens."
            >
              <Button
                variant="outline"
                onClick={() => sendReset.mutate(undefined)}
                disabled={!user.isActive || sendReset.isPending}
              >
                {sendReset.isPending && <Spinner size="sm" className="mr-2" />}
                Send Email
              </Button>
            </ActionRow>
            <Separator />
            <ActionRow
              title="Set a temporary password"
              description="For users without email access. They must choose a new password at their next sign-in."
            >
              <Button variant="outline" onClick={() => setTemporaryOpen(true)} disabled={isSelf}>
                Set Password
              </Button>
            </ActionRow>
          </>
        )}
        {user.twoFactorEnabled && !isSelf && (
          <>
            <Separator />
            <ActionRow
              title="Reset two-factor authentication"
              description="Removes their authenticator app, passkeys and recovery codes."
            >
              <Button
                variant="outline"
                onClick={() =>
                  confirm({
                    title: 'Reset two-factor authentication',
                    description: `This removes the authenticator app, passkeys and recovery codes of ${user.name} and revokes their API tokens. If a two-factor policy applies, they set up a new method at their next sign-in.`,
                    action: 'Reset',
                    onConfirm: () => resetTwoFactor.mutate(undefined),
                  })
                }
              >
                Reset
              </Button>
            </ActionRow>
          </>
        )}
        {!pending && !isSelf && (
          <>
            <Separator />
            <ActionRow
              title="Sign out of all sessions"
              description="Ends every browser session of this user. API tokens keep working."
            >
              <Button
                variant="outline"
                onClick={() =>
                  confirm({
                    title: 'Sign out of all sessions',
                    description: `${user.name} is signed out on every device and must sign in again.`,
                    action: 'Sign Out',
                    onConfirm: () => signOut.mutate(undefined),
                  })
                }
              >
                Sign Out
              </Button>
            </ActionRow>
          </>
        )}
      </div>
      <TemporaryPasswordDialog user={user} open={temporaryOpen} onOpenChange={setTemporaryOpen} />
    </SettingsCard>
  );
}
