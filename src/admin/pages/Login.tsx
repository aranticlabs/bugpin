import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound } from 'lucide-react';
import { useAuth, type TwoFactorMethods } from '../contexts/AuthContext';
import { passkeyErrorMessage, passkeysSupported } from '../lib/passkeys';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Spinner } from '../components/ui/spinner';
import { Separator } from '../components/ui/separator';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface TwoFactorStep {
  challengeToken: string;
  methods: TwoFactorMethods;
}

function errorMessage(err: unknown, fallback: string): string {
  const response = (err as { response?: { data?: { message?: string } } }).response;
  if (response?.data?.message) return response.data.message;
  return err instanceof Error ? err.message : fallback;
}

export function Login() {
  const { login, loginWithPasskey } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [twoFactorStep, setTwoFactorStep] = useState<TwoFactorStep | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setError('');
    setIsLoading(true);

    try {
      const step = await login(data.email, data.password);
      if (step.status === 'two-factor') {
        setTwoFactorStep({ challengeToken: step.challengeToken, methods: step.methods });
        return;
      }
      navigate('/');
    } catch (err) {
      if (err instanceof Error && err.message.includes('401')) {
        setError('Invalid email or password. Please try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const onPasskeySignIn = async () => {
    setError('');
    setIsPasskeyLoading(true);
    try {
      await loginWithPasskey();
      navigate('/');
    } catch (err) {
      setError(passkeyErrorMessage(err, 'Sign-in with a passkey failed. Please try again.'));
    } finally {
      setIsPasskeyLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2">
            <img src="/branding/light/logo-light.svg" alt="BugPin" className="h-10 dark:hidden" />
            <img
              src="/branding/dark/logo-dark.svg"
              alt="BugPin"
              className="h-10 hidden dark:block"
            />
          </div>
          {twoFactorStep ? (
            <CardTitle className="text-xl">Two-factor authentication</CardTitle>
          ) : (
            <CardDescription>Sign in to your account</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {twoFactorStep ? (
            <TwoFactorForm
              step={twoFactorStep}
              onBack={() => {
                setTwoFactorStep(null);
                setError('');
              }}
              onSignedIn={() => navigate('/')}
            />
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  {...register('email')}
                  aria-invalid={!!errors.email}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  {...register('password')}
                  aria-invalid={!!errors.password}
                />
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                )}
              </div>

              <Button type="submit" disabled={isLoading || isPasskeyLoading} className="w-full">
                {isLoading ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>

              {passkeysSupported() && (
                <>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Separator className="flex-1" />
                    or
                    <Separator className="flex-1" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isLoading || isPasskeyLoading}
                    onClick={onPasskeySignIn}
                  >
                    {isPasskeyLoading ? (
                      <Spinner size="sm" className="mr-2" />
                    ) : (
                      <KeyRound className="mr-2 h-4 w-4" />
                    )}
                    Sign in with a passkey
                  </Button>
                </>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type SecondFactorMethod = 'totp' | 'passkey' | 'recovery';

const METHOD_LINKS: Record<SecondFactorMethod, string> = {
  totp: 'Use your authenticator app',
  passkey: 'Use a passkey',
  recovery: 'Use a recovery code',
};

function TwoFactorForm({
  step,
  onBack,
  onSignedIn,
}: {
  step: TwoFactorStep;
  onBack: () => void;
  onSignedIn: () => void;
}) {
  const { completeTwoFactor, completeTwoFactorWithPasskey } = useAuth();
  const available: SecondFactorMethod[] = [
    ...(step.methods.totp ? (['totp'] as const) : []),
    ...(step.methods.passkey && passkeysSupported() ? (['passkey'] as const) : []),
    ...(step.methods.recoveryCode ? (['recovery'] as const) : []),
  ];
  const [method, setMethod] = useState<SecondFactorMethod>(available[0] ?? 'recovery');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (method === 'passkey') {
      setIsSubmitting(true);
      try {
        await completeTwoFactorWithPasskey(step.challengeToken);
        onSignedIn();
      } catch (err) {
        setError(passkeyErrorMessage(err, 'Verification failed. Please try again.'));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }
    if (!value.trim()) {
      setError(method === 'recovery' ? 'Enter a recovery code' : 'Enter the 6-digit code');
      return;
    }
    setIsSubmitting(true);
    try {
      await completeTwoFactor(
        step.challengeToken,
        method === 'recovery' ? { recoveryCode: value.trim() } : { code: value.trim() }
      );
      onSignedIn();
    } catch (err) {
      setError(errorMessage(err, 'Verification failed. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMethod = (next: SecondFactorMethod) => {
    setMethod(next);
    setValue('');
    setError('');
  };

  const instructions: Record<SecondFactorMethod, string> = {
    totp: 'Enter the 6-digit code from your authenticator app.',
    passkey: 'Confirm it is you with one of your passkeys.',
    recovery: 'Enter one of your recovery codes. Each code works only once.',
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-muted-foreground text-center">{instructions[method]}</p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {method !== 'passkey' && (
        <div className="space-y-2">
          <Label htmlFor="two-factor-code">
            {method === 'recovery' ? 'Recovery code' : 'Code'}
          </Label>
          <Input
            id="two-factor-code"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="one-time-code"
            inputMode={method === 'recovery' ? 'text' : 'numeric'}
            placeholder={method === 'recovery' ? 'xxxxx-xxxxx' : '123456'}
            maxLength={method === 'recovery' ? 20 : 6}
            autoFocus
          />
        </div>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <>
            <Spinner size="sm" className="mr-2" />
            Verifying...
          </>
        ) : method === 'passkey' ? (
          <>
            <KeyRound className="mr-2 h-4 w-4" />
            Use passkey
          </>
        ) : (
          'Verify'
        )}
      </Button>

      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm">
        {available
          .filter((option) => option !== method)
          .map((option) => (
            <span key={option} className="flex items-center gap-2">
              <button
                type="button"
                className="text-primary underline-offset-4 hover:underline"
                onClick={() => switchMethod(option)}
              >
                {METHOD_LINKS[option]}
              </button>
              <span className="text-muted-foreground" aria-hidden="true">
                ·
              </span>
            </span>
          ))}
        <button
          type="button"
          className="text-primary underline-offset-4 hover:underline"
          onClick={onBack}
        >
          Back
        </button>
      </div>
    </form>
  );
}
