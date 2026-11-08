import { useState, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { apiErrorMessage } from '../../lib/apiError';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { Trash2, RefreshCw, Mail, ChevronsUpDown, ShieldOff } from 'lucide-react';
import { Spinner } from '../../components/ui/spinner';
import { LoadError } from '../../components/dashboard/LoadError';
import {
  ConfirmActionDialog,
  deactivateConfirmation,
  roleChangeConfirmation,
  type Confirmation,
} from '../../components/users/ConfirmActionDialog';
import { DefaultProjectList } from '../../components/users/DefaultProjectList';
import {
  ROLE_LABELS,
  USER_ROLES,
  canReceiveDefaultProjects,
  isPendingInvitation,
  toUserRole,
} from '../../components/users/userHelpers';
import { USERS_QUERY_KEY, useUpdateUser, useUsers } from '../../components/users/useUsers';
import type { User } from '@shared/types';

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30)
    return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
  return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;
}

function getDefaultProjectsLabel(user: User): string {
  const defaultProjects = user.defaultProjects ?? [];
  if (defaultProjects.length === 0) return 'No default projects';
  if (defaultProjects.length === 1) return defaultProjects[0].name;
  return `${defaultProjects.length} default projects`;
}

export function Users() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [resetTwoFactorUser, setResetTwoFactorUser] = useState<User | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const { data, isLoading, isError, refetch } = useUsers();
  const updateMutation = useUpdateUser();

  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; name: string; role: string }) => {
      const response = await api.post('/users/invite', data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      setShowInviteModal(false);
      if (data.warning) {
        toast.warning(data.warning);
      } else {
        toast.success('Invitation sent successfully');
      }
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, 'Failed to send invitation'));
    },
  });

  const resendInvitationMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await api.post(`/users/${userId}/resend-invitation`);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      if (data.warning) {
        toast.warning(data.warning);
      } else {
        toast.success('Invitation resent successfully');
      }
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, 'Failed to resend invitation'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      setDeleteUser(null);
      toast.success('User deleted successfully');
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, 'Failed to delete user'));
    },
  });

  const resetTwoFactorMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/users/${userId}/two-factor`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      setResetTwoFactorUser(null);
      toast.success('Two-factor authentication reset');
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, 'Failed to reset two-factor authentication'));
    },
  });

  const changeRole = (user: User, value: string) => {
    const role = toUserRole(value);
    if (!role || role === user.role) return;
    setConfirmation(
      roleChangeConfirmation(user, role, () => updateMutation.mutate({ id: user.id, role }))
    );
  };

  const toggleActive = (user: User) => {
    if (!user.isActive) {
      updateMutation.mutate({ id: user.id, isActive: true });
      return;
    }
    setConfirmation(
      deactivateConfirmation(user, () => updateMutation.mutate({ id: user.id, isActive: false }))
    );
  };

  const renderRows = () => {
    if (isLoading) {
      return (
        <TableRow>
          <TableCell colSpan={5} className="text-center py-12">
            <Spinner className="mx-auto text-primary" />
          </TableCell>
        </TableRow>
      );
    }
    if (!data && isError) {
      return (
        <TableRow>
          <TableCell colSpan={5} className="p-0">
            <LoadError what="users" onRetry={() => void refetch()} />
          </TableCell>
        </TableRow>
      );
    }
    if (!data?.length) {
      return (
        <TableRow>
          <TableCell colSpan={5} className="py-12 text-center">
            <p className="text-sm font-medium">No users yet</p>
            <p className="text-sm text-muted-foreground">
              Invite your team to start working on reports together.
            </p>
          </TableCell>
        </TableRow>
      );
    }
    return data.map((user) => {
      const isSelf = user.id === currentUser?.id;
      const pending = isPendingInvitation(user);
      const statusLabel = user.isActive ? 'Active' : 'Inactive';
      return (
        <TableRow key={user.id}>
          <TableCell className="max-w-65">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar key={user.avatarUrl || 'no-avatar'}>
                {user.avatarUrl && user.avatarUrl.trim() !== '' ? (
                  <AvatarImage src={user.avatarUrl} alt={user.name || 'User'} />
                ) : (
                  <AvatarFallback className="bg-brand-subtle text-brand-subtle-foreground">
                    {user.name?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="min-w-0">
                <Link
                  to={`/settings/users/${user.id}`}
                  className="block font-medium truncate hover:underline"
                  title={user.name || undefined}
                >
                  {user.name}
                </Link>
                <p className="text-sm text-muted-foreground truncate" title={user.email}>
                  {user.email}
                </p>
              </div>
            </div>
          </TableCell>
          <TableCell className="align-top">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 w-60 justify-between text-left font-normal"
                >
                  <span className="truncate">{getDefaultProjectsLabel(user)}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-0">
                <fieldset className="min-w-0">
                  <legend className="px-4 pt-3 text-sm font-medium">Default Projects</legend>
                  <div className="border-b px-4 pb-3">
                    <p className="text-xs text-muted-foreground">
                      New reports from selected projects are assigned to {user.name}.
                    </p>
                    {!canReceiveDefaultProjects(user) ? (
                      <p className="mt-2 text-xs text-warning">
                        This user must be active and have accepted their invitation before they can
                        be added to new default projects.
                      </p>
                    ) : null}
                  </div>
                  <DefaultProjectList user={user} className="max-h-72" />
                </fieldset>
              </PopoverContent>
            </Popover>
          </TableCell>
          <TableCell>
            <Select
              value={user.role}
              onValueChange={(value) => changeRole(user, value)}
              disabled={isSelf || pending}
            >
              <SelectTrigger className="w-30" aria-label={`Role of ${user.name}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {USER_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TableCell>
          <TableCell>
            {pending ? (
              <div className="flex flex-col gap-1">
                <Badge variant="outline" className="status-pending w-fit">
                  Pending
                </Badge>
                {user.invitationSentAt && (
                  <span className="text-xs text-muted-foreground">
                    Invited {formatRelativeTime(user.invitationSentAt)}
                  </span>
                )}
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleActive(user)}
                disabled={isSelf}
                aria-label={`${statusLabel}. ${user.isActive ? 'Deactivate' : 'Activate'} ${user.name}`}
              >
                <Badge
                  variant="outline"
                  className={cn(
                    'cursor-pointer',
                    user.isActive ? 'status-active' : 'status-inactive'
                  )}
                >
                  {statusLabel}
                </Badge>
              </Button>
            )}
            {user.twoFactorEnabled && (
              <Badge variant="secondary" className="ml-1" title="Two-factor authentication on">
                2FA
              </Badge>
            )}
          </TableCell>
          <TableCell className="text-right">
            <div className="flex items-center justify-end gap-1">
              {pending && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resendInvitationMutation.mutate(user.id)}
                  disabled={resendInvitationMutation.isPending}
                  title="Resend invitation"
                  aria-label={`Resend invitation to ${user.name}`}
                >
                  {resendInvitationMutation.isPending ? (
                    <Spinner size="sm" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              )}
              {user.twoFactorEnabled && !isSelf && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setResetTwoFactorUser(user)}
                  title="Reset two-factor authentication"
                  aria-label={`Reset two-factor authentication of ${user.name}`}
                >
                  <ShieldOff className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost-destructive"
                size="sm"
                onClick={() => setDeleteUser(user)}
                disabled={isSelf}
                title="Delete user"
                aria-label={`Delete ${user.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </TableCell>
        </TableRow>
      );
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Users</h2>
          <p className="text-sm text-muted-foreground">Manage user accounts and permissions</p>
        </div>
        <Button onClick={() => setShowInviteModal(true)}>
          <Mail className="h-4 w-4 mr-2" />
          Invite User
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Default Projects</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{renderRows()}</TableBody>
        </Table>
      </Card>

      <InviteUserModal
        open={showInviteModal}
        onOpenChange={setShowInviteModal}
        onInvite={(data) => inviteMutation.mutate(data)}
        isLoading={inviteMutation.isPending}
      />

      <ConfirmActionDialog confirmation={confirmation} onClose={() => setConfirmation(null)} />

      <AlertDialog open={!!resetTwoFactorUser} onOpenChange={() => setResetTwoFactorUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset two-factor authentication</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the authenticator app, passkeys and recovery codes of "
              {resetTwoFactorUser?.name}" ({resetTwoFactorUser?.email}) and revokes their API
              tokens. Use it when they lost their device. If a two-factor policy applies, they set
              up a new method at their next sign-in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="outline-destructive"
              onClick={() =>
                resetTwoFactorUser && resetTwoFactorMutation.mutate(resetTwoFactorUser.id)
              }
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteUser} onOpenChange={() => setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteUser?.name}" ({deleteUser?.email})? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="outline-destructive"
              onClick={() => deleteUser && deleteMutation.mutate(deleteUser.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const inviteUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
  role: z.enum(['admin', 'editor', 'viewer']),
});

type InviteUserFormData = z.infer<typeof inviteUserSchema>;

function InviteUserModal({
  open,
  onOpenChange,
  onInvite,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvite: (data: { email: string; name: string; role: string }) => void;
  isLoading: boolean;
}) {
  const [selectedRole, setSelectedRole] = useState('viewer');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteUserFormData>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      name: '',
      email: '',
      role: 'viewer',
    },
  });

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      reset({ name: '', email: '', role: 'viewer' });
      setSelectedRole('viewer');
    }
  }, [open, reset]);

  const onSubmit = (data: InviteUserFormData) => {
    onInvite({ ...data, role: selectedRole });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
          <DialogDescription>
            Send an invitation email to a new user. They will set their own password when they
            accept the invitation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invite-user-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="invite-user-name"
                placeholder="John Doe"
                {...register('name')}
                aria-invalid={!!errors.name}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-user-email">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="invite-user-email"
                type="email"
                placeholder="john@example.com"
                {...register('email')}
                aria-invalid={!!errors.email}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-user-role">Role</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger id="invite-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Invitation
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
