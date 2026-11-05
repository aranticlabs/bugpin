import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { TWO_FACTOR_STATUS_KEY, useTwoFactorStatus } from '../../hooks/useTwoFactorStatus';
import { formatDate } from '../../lib/utils';
import { ChangePasswordForm } from '../ChangePasswordForm';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';
import { Spinner } from '../ui/spinner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { PasswordConfirmDialog } from './PasswordConfirmDialog';
import { RecoveryCodesDialog } from './RecoveryCodesDialog';
import { TotpSetupDialog } from './TotpSetupDialog';

export function SecurityTab() {
  return (
    <>
      <PasswordCard />
      <TwoFactorCard />
    </>
  );
}

function PasswordCard() {
  const { user, refreshUser } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>The password you use to sign in</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {user?.passwordChangedAt
            ? `Last changed ${formatDate(user.passwordChangedAt)}`
            : 'Not changed since the account was created'}
        </p>
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          Change password
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>Other signed-in sessions are signed out.</DialogDescription>
          </DialogHeader>
          <ChangePasswordForm
            onSuccess={async () => {
              setOpen(false);
              await refreshUser();
            }}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function SettingRow({
  title,
  detail,
  action,
}: {
  title: string;
  detail: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <div className="text-sm text-muted-foreground">{detail}</div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

export function TwoFactorCard() {
  const { refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const { data: status, isLoading } = useTwoFactorStatus();
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: TWO_FACTOR_STATUS_KEY });
    await refreshUser();
  };

  const hasSecondFactor = !!status && (status.totpEnabled || status.passkeys.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-Factor Authentication</CardTitle>
        <CardDescription>
          {status?.policy === 'everyone' || (status?.setupRequired ?? false)
            ? 'Your administrator requires a second step when you sign in.'
            : 'Add a second step to your sign-in.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !status ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : (
          <>
            <SettingRow
              title="Authenticator app"
              detail={
                <Badge variant={status.totpEnabled ? 'default' : 'secondary'}>
                  {status.totpEnabled ? 'On' : 'Off'}
                </Badge>
              }
              action={
                status.totpEnabled ? (
                  <Button type="button" variant="outline" onClick={() => setDisableOpen(true)}>
                    Turn off
                  </Button>
                ) : (
                  <Button type="button" onClick={() => setSetupOpen(true)}>
                    Set up
                  </Button>
                )
              }
            />
            {hasSecondFactor && (
              <>
                <Separator />
                <SettingRow
                  title="Recovery codes"
                  detail={`${status.recoveryCodesRemaining} of 10 left`}
                  action={
                    <Button type="button" variant="outline" onClick={() => setRegenerateOpen(true)}>
                      Regenerate
                    </Button>
                  }
                />
              </>
            )}
          </>
        )}
      </CardContent>

      <TotpSetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        onEnabled={async () => {
          toast.success('Authenticator app turned on');
          await refresh();
        }}
      />

      <PasswordConfirmDialog
        open={disableOpen}
        onOpenChange={setDisableOpen}
        title="Turn off authenticator app"
        description="You will no longer be asked for a code from your authenticator app."
        confirmLabel="Turn off"
        destructive
        onConfirm={async (password) => {
          await api.post('/auth/two-factor/totp/disable', { password });
          toast.success('Authenticator app turned off');
          await refresh();
        }}
      />

      <PasswordConfirmDialog
        open={regenerateOpen}
        onOpenChange={setRegenerateOpen}
        title="Regenerate recovery codes"
        description="Your current recovery codes stop working and 10 new codes are created."
        confirmLabel="Regenerate"
        onConfirm={async (password) => {
          const response = await api.post<{ success: boolean; recoveryCodes: string[] }>(
            '/auth/two-factor/recovery-codes',
            { password }
          );
          setNewCodes(response.data.recoveryCodes);
          await refresh();
        }}
      />

      <RecoveryCodesDialog codes={newCodes} onDone={() => setNewCodes(null)} />
    </Card>
  );
}
