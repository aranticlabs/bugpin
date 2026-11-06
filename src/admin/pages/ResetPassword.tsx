import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { cn } from '../lib/utils';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { api } from '../api/client';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Spinner } from '../components/ui/spinner';
import { PasswordRequirements, passwordMeetsPolicy } from '../components/PasswordRequirements';
import { usePasswordPolicy } from '../hooks/usePasswordPolicy';
import type { PasswordPolicy } from '@shared/password-policy';

function createResetSchema(policy: PasswordPolicy) {
  return z
    .object({
      password: z.string(),
      confirmPassword: z.string().min(1, 'Please confirm your password'),
    })
    .refine((data) => passwordMeetsPolicy(data.password, policy), {
      message: 'Password does not meet the requirements',
      path: ['password'],
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords don't match",
      path: ['confirmPassword'],
    });
}

type ResetFormData = z.infer<ReturnType<typeof createResetSchema>>;

type ApiError = Error & { response?: { data?: { message?: string } } };

const INVALID_LINK =
  'This reset link is invalid, was already used, or has expired. Ask an administrator to send a new one.';

function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">{children}</Card>
    </div>
  );
}

export function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [isValidating, setIsValidating] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const policy = usePasswordPolicy();
  const schema = useMemo(() => createResetSchema(policy), [policy]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetFormData>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  useEffect(() => {
    if (!token) {
      setValidationError(INVALID_LINK);
      setIsValidating(false);
      return;
    }
    api
      .get(`/password-reset/validate/${encodeURIComponent(token)}`)
      .then((response) => setEmail(response.data.user.email))
      .catch(() => setValidationError(INVALID_LINK))
      .finally(() => setIsValidating(false));
  }, [token]);

  const onSubmit = async (data: ResetFormData) => {
    if (!token) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await api.post('/password-reset', { token, password: data.password });
      setIsDone(true);
    } catch (err: unknown) {
      setSubmitError((err as ApiError).response?.data?.message || 'Failed to reset the password');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isValidating) {
    return (
      <CenteredCard>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-4">
            <Spinner size="lg" className="text-primary" />
            <p className="text-muted-foreground">Checking your reset link...</p>
          </div>
        </CardContent>
      </CenteredCard>
    );
  }

  if (validationError || isDone) {
    return (
      <CenteredCard>
        <CardHeader className="text-center">
          <div
            className={cn(
              'mx-auto w-12 h-12 flex items-center justify-center rounded-full',
              isDone
                ? 'bg-brand-subtle text-brand-subtle-foreground'
                : 'bg-destructive/10 text-destructive'
            )}
          >
            {isDone ? <CheckCircle2 className="w-7 h-7" /> : <AlertCircle className="w-7 h-7" />}
          </div>
          <CardTitle className="text-2xl mt-4">
            {isDone ? 'Password Updated' : 'Invalid Reset Link'}
          </CardTitle>
          <CardDescription>
            {isDone ? 'Sign in with your new password.' : validationError}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button
            variant={isDone ? 'default' : 'outline'}
            onClick={() => navigate('/login', { replace: true })}
          >
            Go to Sign In
          </Button>
        </CardContent>
      </CenteredCard>
    );
  }

  return (
    <CenteredCard>
      <CardHeader className="text-center">
        <div className="mx-auto w-12 h-12 flex items-center justify-center rounded-full bg-brand-subtle text-brand-subtle-foreground">
          <KeyRound className="w-7 h-7" />
        </div>
        <CardTitle className="text-2xl mt-4">Choose a New Password</CardTitle>
        <CardDescription>For {email}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {submitError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...register('password')}
              aria-invalid={!!errors.password}
            />
            <PasswordRequirements password={watch('password')} policy={policy} />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register('confirmPassword')}
              aria-invalid={!!errors.confirmPassword}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting && <Spinner size="sm" className="mr-2" />}
            Set New Password
          </Button>
        </form>
      </CardContent>
    </CenteredCard>
  );
}
