import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import { Spinner } from '../ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { RecoveryCodesSaveStep } from './RecoveryCodesDialog';
import { TotpQrCode } from './TotpQrCode';

type Step = 'scan' | 'verify' | 'codes';

export interface TotpSetup {
  secret: string;
  otpauthUri: string;
}

function apiError(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback
  );
}

function formatSecret(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret;
}

/**
 * Three steps: scan the QR code, confirm a code, save the recovery codes. The secret comes
 * from a setup request the caller makes after confirming the password.
 */
export function TotpSetupDialog({
  open,
  onOpenChange,
  setup,
  onEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setup: TotpSetup | null;
  onEnabled: () => void | Promise<void>;
}) {
  const [step, setStep] = useState<Step>('scan');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep('scan');
    setCode('');
    setRecoveryCodes([]);
    setSaved(false);
    setError('');
  }, [open]);

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsBusy(true);
    try {
      const response = await api.post<{ success: boolean; recoveryCodes: string[] | null }>(
        '/auth/two-factor/totp/confirm',
        { code: code.trim() }
      );
      if (response.data.recoveryCodes) {
        setRecoveryCodes(response.data.recoveryCodes);
        setStep('codes');
      } else {
        await finish();
      }
    } catch (err) {
      setError(apiError(err, 'The code is not valid'));
    } finally {
      setIsBusy(false);
    }
  };

  const finish = async () => {
    onOpenChange(false);
    await onEnabled();
  };

  // Once the app is confirmed, the dialog can only close through the recovery codes step
  const locked = step === 'codes';

  return (
    <Dialog open={open} onOpenChange={(next) => !locked && onOpenChange(next)}>
      <DialogContent
        showCloseButton={!locked}
        onEscapeKeyDown={(event) => locked && event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Set up authenticator app</DialogTitle>
          <DialogDescription>
            Step {step === 'scan' ? 1 : step === 'verify' ? 2 : 3} of 3
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === 'scan' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Scan this QR code with an authenticator app such as 1Password, Bitwarden, Google
              Authenticator or Microsoft Authenticator.
            </p>
            {setup && (
              <>
                <div className="flex justify-center">
                  <TotpQrCode uri={setup.otpauthUri} />
                </div>
                <div className="space-y-1 text-sm">
                  <p className="text-muted-foreground">Can&apos;t scan? Enter this key instead:</p>
                  <p className="font-mono select-all">{formatSecret(setup.secret)}</p>
                </div>
              </>
            )}
            <DialogFooter>
              <Button type="button" onClick={() => setStep('verify')} disabled={!setup}>
                Next
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'verify' && (
          <form onSubmit={verify} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="totp-setup-code">Enter the 6-digit code from the app</Label>
              <Input
                id="totp-setup-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep('scan')}>
                Back
              </Button>
              <Button type="submit" disabled={isBusy || code.trim().length !== 6}>
                {isBusy && <Spinner size="sm" className="mr-2" />}
                Verify
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === 'codes' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your authenticator app is set up. Save these recovery codes: each one signs you in
              once if you lose your device. They will not be shown again.
            </p>
            <RecoveryCodesSaveStep codes={recoveryCodes} saved={saved} onSavedChange={setSaved} />
            <DialogFooter>
              <Button type="button" onClick={finish} disabled={!saved}>
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
