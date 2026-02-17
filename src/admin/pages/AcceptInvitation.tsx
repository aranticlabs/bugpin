import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Bug, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Spinner } from '../components/ui/spinner';

const acceptInvitationSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type AcceptInvitationFormData = z.infer<typeof acceptInvitationSchema>;

interface InvitationData {
  email: string;
  name: string;
}

export function AcceptInvitation() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [isValidating, setIsValidating] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<AcceptInvitationFormData>({
    resolver: zodResolver(acceptInvitationSchema),
    defaultValues: {
      name: '',
      password: '',
      confirmPassword: '',
    },
  });

  // Validate token on mount
  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setValidationError('No invitation token provided');
        setIsValidating(false);
        return;
      }

      try {
        const response = await api.get(`/invitations/validate/${token}`);
        if (response.data.success) {
          setInvitation(response.data.invitation);
          setValue('name', response.data.invitation.name);
        } else {
          setValidationError(response.data.message || 'Invalid invitation');
        }
      } catch (err: unknown) {
        const error = err as Error & {
          response?: { data?: { message?: string }; status?: number };
        };
        if (error.response?.status === 410) {
          setValidationError(
            'This invitation has expired. Please ask the administrator to send a new one.',
          );
        } else if (error.response?.status === 404) {
          setValidationError('This invitation is invalid or has already been used.');
        } else {
          setValidationError(error.response?.data?.message || 'Failed to validate invitation');
        }
      } finally {
        setIsValidating(false);
      }
    }

    validateToken();
  }, [token, setValue]);

  const onSubmit = async (data: AcceptInvitationFormData) => {
    if (!token) return;

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const response = await api.post('/invitations/accept', {
        token,
        name: data.name,
        password: data.password,
      });

      if (response.data.success) {
        // Refresh auth context to pick up the new session
        await refreshUser();
        // Redirect to dashboard
        navigate('/', { replace: true });
      } else {
        setSubmitError(response.data.message || 'Failed to accept invitation');
      }
    } catch (err: unknown) {
      const error = err as Error & { response?: { data?: { message?: string }; status?: number } };
      if (error.response?.status === 410) {
        setSubmitError(
          'This invitation has expired. Please ask the administrator to send a new one.',
        );
      } else {
        setSubmitError(error.response?.data?.message || 'Failed to accept invitation');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 py-12 px-4 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md">
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4">
              <Spinner size="lg" className="text-primary" />
              <p className="text-muted-foreground">Validating invitation...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (validationError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 py-12 px-4 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 flex items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="w-7 h-7" />
            </div>
            <CardTitle className="text-2xl mt-4">Invalid Invitation</CardTitle>
            <CardDescription>{validationError}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button variant="outline" onClick={() => navigate('/login')}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success form
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 flex items-center justify-center rounded-full bg-bugpin-primary-100 text-bugpin-primary-700 dark:bg-bugpin-primary-900 dark:text-bugpin-primary-300">
            <Bug className="w-7 h-7" />
          </div>
          <CardTitle className="text-2xl mt-4">Accept Invitation</CardTitle>
          <CardDescription>Complete your account setup to join the team</CardDescription>
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
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                value={invitation?.email || ''}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                This is the email address your invitation was sent to
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">
                Your name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="John Doe"
                {...register('name')}
                aria-invalid={!!errors.name}
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                Password <span className="text-destructive">*</span>
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Min. 8 characters"
                {...register('password')}
                aria-invalid={!!errors.password}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                Confirm password <span className="text-destructive">*</span>
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repeat your password"
                {...register('confirmPassword')}
                aria-invalid={!!errors.confirmPassword}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Setting up account...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Accept Invitation
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
