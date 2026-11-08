import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { TWO_FACTOR_STATUS_KEY, useTwoFactorStatus } from '../../hooks/useTwoFactorStatus';
import { formatDate } from '../../lib/format';
import {
  getPasskeyRegistrationOptions,
  passkeysSupported,
  registerPasskey,
  type PasskeyRegistrationOptions,
} from '../../lib/passkeys';
import { ChangePasswordForm } from '../ChangePasswordForm';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { SettingsCard } from '../ui/settings-card';
import { SettingRow, SettingRows } from '../ui/setting-row';
import { Spinner } from '../ui/spinner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { PasskeyNameDialog } from './PasskeyNameDialog';
import { PasswordConfirmDialog } from './PasswordConfirmDialog';
import { RecoveryCodesDialog } from './RecoveryCodesDialog';
import { TotpSetupDialog, type TotpSetup } from './TotpSetupDialog';
import type { Passkey } from '@shared/types';

export function SecurityTab() {
  return (
    <>
      <PasswordCard />
      <TwoFactorCard className="flex-1" />
    </>
  );
}

function PasswordCard() {
  const { user, refreshUser } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <SettingsCard title="Password" description="The password you use to sign in.">
      <SettingRows>
        <SettingRow
          label="Last Changed"
          description={
            user?.passwordChangedAt
              ? formatDate(user.passwordChangedAt)
              : 'Not changed since the account was created.'
          }
        >
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            Change password
          </Button>
        </SettingRow>
      </SettingRows>

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
    </SettingsCard>
  );
}

export function TwoFactorCard({ className }: { className?: string }) {
  const { refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const { data: status, isLoading } = useTwoFactorStatus();
  const [setupPasswordOpen, setSetupPasswordOpen] = useState(false);
  const [totpSetup, setTotpSetup] = useState<TotpSetup | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [addPasskeyPasswordOpen, setAddPasskeyPasswordOpen] = useState(false);
  const [passkeyOptions, setPasskeyOptions] = useState<PasskeyRegistrationOptions | null>(null);
  const [renaming, setRenaming] = useState<Passkey | null>(null);
  const [removing, setRemoving] = useState<Passkey | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: TWO_FACTOR_STATUS_KEY });
    await refreshUser();
  };

  const hasSecondFactor = !!status && (status.totpEnabled || status.passkeys.length > 0);

  return (
    <SettingsCard
      className={className}
      title="Two-Factor Authentication"
      description={
        status?.policy === 'everyone' || (status?.setupRequired ?? false)
          ? 'Your administrator requires a second step when you sign in.'
          : 'Add a second step to your sign-in.'
      }
    >
      {isLoading || !status ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : (
        <SettingRows>
          <SettingRow
            label={
              <span className="flex items-center gap-2">
                Authenticator App
                <Badge variant={status.totpEnabled ? 'default' : 'secondary'}>
                  {status.totpEnabled ? 'On' : 'Off'}
                </Badge>
              </span>
            }
            description="Enter a code from an authenticator app when you sign in."
          >
            {status.totpEnabled ? (
              <Button type="button" variant="outline" onClick={() => setDisableOpen(true)}>
                Turn off
              </Button>
            ) : (
              <Button type="button" onClick={() => setSetupPasswordOpen(true)}>
                Set up
              </Button>
            )}
          </SettingRow>
          <div className="py-3">
            <SettingRow
              className="py-0"
              label="Passkeys"
              description={
                passkeysSupported()
                  ? 'Sign in with your fingerprint, face or device PIN.'
                  : 'This browser does not support passkeys.'
              }
            >
              <Button
                type="button"
                variant={status.passkeys.length > 0 ? 'outline' : 'default'}
                onClick={() => setAddPasskeyPasswordOpen(true)}
                disabled={!passkeysSupported()}
              >
                Add passkey
              </Button>
            </SettingRow>
            {status.passkeys.length > 0 && (
              <ul className="mt-3 divide-y rounded-md border">
                {status.passkeys.map((passkey) => (
                  <li
                    key={passkey.id}
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{passkey.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Added {formatDate(passkey.createdAt)}
                        {passkey.lastUsedAt
                          ? `, last used ${formatDate(passkey.lastUsedAt)}`
                          : ', never used'}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Rename ${passkey.name}`}
                        onClick={() => setRenaming(passkey)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost-destructive"
                        size="icon"
                        aria-label={`Remove ${passkey.name}`}
                        onClick={() => setRemoving(passkey)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {hasSecondFactor && (
            <SettingRow
              label="Recovery Codes"
              description={`${status.recoveryCodesRemaining} of 10 left.`}
            >
              <Button type="button" variant="outline" onClick={() => setRegenerateOpen(true)}>
                Regenerate
              </Button>
            </SettingRow>
          )}
        </SettingRows>
      )}

      <PasswordConfirmDialog
        open={setupPasswordOpen}
        onOpenChange={setSetupPasswordOpen}
        title="Set up authenticator app"
        description="Enter your password to set up an authenticator app."
        confirmLabel="Continue"
        onConfirm={async (password) => {
          const response = await api.post<TotpSetup & { success: boolean }>(
            '/auth/two-factor/totp/setup',
            { password }
          );
          setTotpSetup({ secret: response.data.secret, otpauthUri: response.data.otpauthUri });
          setSetupOpen(true);
        }}
      />

      <TotpSetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        setup={totpSetup}
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

      <PasswordConfirmDialog
        open={addPasskeyPasswordOpen}
        onOpenChange={setAddPasskeyPasswordOpen}
        title="Add a passkey"
        description="Enter your password to add a passkey."
        confirmLabel="Continue"
        onConfirm={async (password) => {
          setPasskeyOptions(await getPasskeyRegistrationOptions(password));
        }}
      />

      {/* The options are fetched first so a wrong password is reported in the password dialog */}
      <PasskeyNameDialog
        open={passkeyOptions !== null}
        onOpenChange={(open) => !open && setPasskeyOptions(null)}
        title="Add a passkey"
        description="Name the passkey so you can recognize it later. Your browser then asks you to create it."
        confirmLabel="Continue"
        initialName="Passkey"
        onSubmit={async (name) => {
          if (!passkeyOptions) return;
          const codes = await registerPasskey(passkeyOptions, name);
          toast.success('Passkey added');
          if (codes) {
            setNewCodes(codes);
          } else {
            await refresh();
          }
        }}
      />

      <PasskeyNameDialog
        open={renaming !== null}
        onOpenChange={(open) => !open && setRenaming(null)}
        title="Rename passkey"
        description="Choose a name that tells you which device holds this passkey."
        confirmLabel="Save"
        initialName={renaming?.name ?? ''}
        onSubmit={async (name) => {
          if (!renaming) return;
          await api.patch(`/auth/passkeys/${renaming.id}`, { name });
          await refresh();
        }}
      />

      <PasswordConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove passkey"
        description={`"${removing?.name ?? ''}" can no longer be used to sign in.`}
        confirmLabel="Remove"
        destructive
        onConfirm={async (password) => {
          if (!removing) return;
          await api.delete(`/auth/passkeys/${removing.id}`, { data: { password } });
          toast.success('Passkey removed');
          await refresh();
        }}
      />

      {/* Refreshing the user can close a forced setup dialog, so it waits until the codes are saved */}
      <RecoveryCodesDialog
        codes={newCodes}
        onDone={() => {
          setNewCodes(null);
          void refresh();
        }}
      />
    </SettingsCard>
  );
}
