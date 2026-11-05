import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '../api/client';
import { usePasswordPolicy } from '../hooks/usePasswordPolicy';
import { PasswordRequirements, passwordMeetsPolicy } from './PasswordRequirements';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Spinner } from './ui/spinner';
import type { PasswordPolicy } from '@shared/password-policy';

function createSchema(policy: PasswordPolicy) {
  return z
    .object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z.string(),
      confirmPassword: z.string().min(1, 'Please confirm your new password'),
    })
    .refine((data) => passwordMeetsPolicy(data.newPassword, policy), {
      message: 'Password does not meet the requirements',
      path: ['newPassword'],
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    })
    .refine((data) => data.newPassword !== data.currentPassword, {
      message: 'New password must be different from the current password',
      path: ['newPassword'],
    });
}

type ChangePasswordFormData = z.infer<ReturnType<typeof createSchema>>;

export function ChangePasswordForm({
  onSuccess,
  submitLabel = 'Update password',
}: {
  onSuccess: () => void | Promise<void>;
  submitLabel?: string;
}) {
  const policy = usePasswordPolicy();
  const schema = useMemo(() => createSchema(policy), [policy]);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async (data: ChangePasswordFormData) => {
    setError('');
    setIsSubmitting(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast.success('Password changed successfully');
      await onSuccess();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Failed to change password';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="change-current-password">
          Current password <span className="text-destructive">*</span>
        </Label>
        <Input
          id="change-current-password"
          type="password"
          autoComplete="current-password"
          {...register('currentPassword')}
          aria-invalid={!!errors.currentPassword}
        />
        {errors.currentPassword && (
          <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="change-new-password">
          New password <span className="text-destructive">*</span>
        </Label>
        <Input
          id="change-new-password"
          type="password"
          autoComplete="new-password"
          {...register('newPassword')}
          aria-invalid={!!errors.newPassword}
        />
        <PasswordRequirements password={watch('newPassword')} policy={policy} />
        {errors.newPassword && (
          <p className="text-xs text-destructive">{errors.newPassword.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="change-confirm-password">
          Confirm password <span className="text-destructive">*</span>
        </Label>
        <Input
          id="change-confirm-password"
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
        {isSubmitting ? (
          <>
            <Spinner size="sm" className="mr-2" />
            Updating...
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </form>
  );
}
