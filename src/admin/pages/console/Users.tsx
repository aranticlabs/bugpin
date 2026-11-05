import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ScrollArea } from '../../components/ui/scroll-area';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Checkbox } from '../../components/ui/checkbox';
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
import type { DefaultProjectReference, Project, User } from '@shared/types';

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

export function Users() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [resetTwoFactorUser, setResetTwoFactorUser] = useState<User | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await api.get('/users');
      return response.data.users as User[];
    },
  });

  const { data: projects = [], isLoading: isLoadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await api.get('/projects');
      return response.data.projects as Project[];
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; name: string; role: string }) => {
      const response = await api.post('/users/invite', data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowInviteModal(false);
      if (data.warning) {
        toast.warning(data.warning);
      } else {
        toast.success('Invitation sent successfully');
      }
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to send invitation');
    },
  });

  const resendInvitationMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await api.post(`/users/${userId}/resend-invitation`);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      if (data.warning) {
        toast.warning(data.warning);
      } else {
        toast.success('Invitation resent successfully');
      }
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to resend invitation');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      role?: string;
      isActive?: boolean;
      defaultProjectIds?: string[];
    }) => {
      const response = await api.patch(`/users/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('User updated successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to update user');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeleteUser(null);
      toast.success('User deleted successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to delete user');
    },
  });

  const resetTwoFactorMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/users/${userId}/two-factor`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setResetTwoFactorUser(null);
      toast.success('Two-factor authentication reset');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to reset two-factor authentication');
    },
  });

  const isPendingInvitation = (user: User): boolean => {
    return !!(user.invitationSentAt && !user.invitationAcceptedAt);
  };

  const isAssignableUser = (user: User): boolean => {
    return user.isActive && !isPendingInvitation(user);
  };

  const getDefaultProjects = (user: User): DefaultProjectReference[] => {
    return user.defaultProjects ?? [];
  };

  const getDefaultProjectsLabel = (defaultProjects: DefaultProjectReference[]): string => {
    if (defaultProjects.length === 0) return 'No default projects';
    if (defaultProjects.length === 1) return defaultProjects[0].name;
    return `${defaultProjects.length} default projects`;
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

      {/* Users table */}
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
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <Spinner className="mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : (
              data?.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="max-w-[260px]">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar key={user.avatarUrl || 'no-avatar'}>
                        {user.avatarUrl && user.avatarUrl.trim() !== '' ? (
                          <AvatarImage src={user.avatarUrl} alt={user.name || 'User'} />
                        ) : (
                          <AvatarFallback className="bg-bugpin-primary-100 text-bugpin-primary-700 dark:bg-bugpin-primary-900 dark:text-bugpin-primary-300">
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
                          className="h-9 w-[240px] justify-between text-left font-normal"
                        >
                          <span className="truncate">
                            {getDefaultProjectsLabel(getDefaultProjects(user))}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-80 p-0">
                        <div className="border-b px-4 py-3">
                          <p className="text-sm font-medium">Default Projects</p>
                          <p className="text-xs text-muted-foreground">
                            New reports from selected projects are assigned to {user.name}.
                          </p>
                          {!isAssignableUser(user) ? (
                            <p className="mt-2 text-xs text-amber-600">
                              This user must be active and have accepted their invitation before
                              they can be added to new default projects.
                            </p>
                          ) : null}
                        </div>
                        <ScrollArea className="max-h-72" contentClassName="p-2">
                          {isLoadingProjects ? (
                            <div className="py-4 text-center">
                              <Spinner className="mx-auto text-primary" />
                            </div>
                          ) : projects.length === 0 ? (
                            <p className="px-2 py-3 text-sm text-muted-foreground">
                              No projects available.
                            </p>
                          ) : (
                            projects.map((project) => {
                              const selectedProjectIds = new Set(
                                getDefaultProjects(user).map((item) => item.id)
                              );
                              const checked = selectedProjectIds.has(project.id);
                              const disabled = !checked && !isAssignableUser(user);

                              return (
                                <label
                                  key={project.id}
                                  className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent ${
                                    disabled ? 'cursor-not-allowed opacity-60' : ''
                                  }`}
                                >
                                  <Checkbox
                                    checked={checked}
                                    disabled={disabled || updateMutation.isPending}
                                    onCheckedChange={(nextChecked) => {
                                      const nextProjectIds = nextChecked
                                        ? [...selectedProjectIds, project.id]
                                        : [...selectedProjectIds].filter((id) => id !== project.id);

                                      updateMutation.mutate({
                                        id: user.id,
                                        defaultProjectIds: nextProjectIds,
                                      });
                                    }}
                                  />
                                  <span className="flex-1">{project.name}</span>
                                </label>
                              );
                            })
                          )}
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={user.role}
                      onValueChange={(value) => updateMutation.mutate({ id: user.id, role: value })}
                      disabled={user.id === currentUser?.id || isPendingInvitation(user)}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {isPendingInvitation(user) ? (
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="status-pending w-fit">
                          Pending
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Invited {formatRelativeTime(user.invitationSentAt!)}
                        </span>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          updateMutation.mutate({ id: user.id, isActive: !user.isActive })
                        }
                        disabled={user.id === currentUser?.id}
                      >
                        <Badge
                          variant="outline"
                          className={`cursor-pointer ${user.isActive ? 'status-active' : 'status-inactive'}`}
                        >
                          {user.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </Button>
                    )}
                    {user.twoFactorEnabled && (
                      <Badge
                        variant="secondary"
                        className="ml-1"
                        title="Two-factor authentication on"
                      >
                        2FA
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isPendingInvitation(user) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => resendInvitationMutation.mutate(user.id)}
                          disabled={resendInvitationMutation.isPending}
                          title="Resend invitation"
                        >
                          {resendInvitationMutation.isPending ? (
                            <Spinner size="sm" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      {user.twoFactorEnabled && user.id !== currentUser?.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setResetTwoFactorUser(user)}
                          title="Reset two-factor authentication"
                          aria-label="Reset two-factor authentication"
                        >
                          <ShieldOff className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost-destructive"
                        size="sm"
                        onClick={() => setDeleteUser(user)}
                        disabled={user.id === currentUser?.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Invite Modal */}
      <InviteUserModal
        open={showInviteModal}
        onOpenChange={setShowInviteModal}
        onInvite={(data) => inviteMutation.mutate(data)}
        isLoading={inviteMutation.isPending}
      />

      {/* Reset Two-Factor Confirmation */}
      <AlertDialog open={!!resetTwoFactorUser} onOpenChange={() => setResetTwoFactorUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset two-factor authentication</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the authenticator app, passkeys and recovery codes of "
              {resetTwoFactorUser?.name}" ({resetTwoFactorUser?.email}). Use it when they lost their
              device. If a two-factor policy applies, they set up a new method at their next
              sign-in.
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

      {/* Delete Confirmation */}
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
              <Label htmlFor="user-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="user-name"
                placeholder="John Doe"
                {...register('name')}
                aria-invalid={!!errors.name}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-email">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="user-email"
                type="email"
                placeholder="john@example.com"
                {...register('email')}
                aria-invalid={!!errors.email}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-role">Role</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
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
