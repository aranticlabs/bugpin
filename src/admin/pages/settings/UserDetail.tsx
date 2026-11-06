import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../api/client';
import { licenseApi } from '../../api/license';
import { useAuth } from '../../contexts/AuthContext';
import { UpgradePrompt } from '../../components/UpgradePrompt';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Separator } from '../../components/ui/separator';
import { Spinner } from '../../components/ui/spinner';
import { Switch } from '../../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
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
import type { ApiToken, ApiTokenScope, Project, User, UserRole } from '@shared/types';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';

type ApiError = Error & { response?: { data?: { message?: string } } };

interface Confirmation {
  title: string;
  description: string;
  action: string;
  destructive?: boolean;
  onConfirm: () => void;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

function errorMessage(error: ApiError, fallback: string): string {
  return error.response?.data?.message || fallback;
}

function isPendingInvitation(user: User): boolean {
  return !!(user.invitationSentAt && !user.invitationAcceptedAt);
}

function scopeLabel(scopes: ApiTokenScope[]): string {
  if (scopes.includes('admin')) return 'Admin';
  if (scopes.includes('write')) return 'Read and write';
  return 'Read only';
}

function formatDate(value?: string): string {
  return value ? new Date(value).toLocaleDateString('en-US', { dateStyle: 'medium' }) : 'Never';
}

function useUserMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<unknown>,
  successMessage: string,
  failureMessage: string,
  onSuccess?: () => void
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(successMessage);
      onSuccess?.();
    },
    onError: (error: ApiError) => toast.error(errorMessage(error, failureMessage)),
  });
}

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

function AccountSection({ user }: { user: User }) {
  const [name, setName] = useState(user.name);
  useEffect(() => setName(user.name), [user.name]);
  const save = useUserMutation(
    () => api.patch(`/users/${user.id}`, { name: name.trim() }),
    'Name updated',
    'Failed to update the name'
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Name shown to the team and in notifications</CardDescription>
      </CardHeader>
      <UnsavedChangesGuard
        isDirty={name.trim() !== user.name}
        onSave={async () => name.trim().length >= 2 && save.mutateAsync(undefined)}
        onDiscard={() => setName(user.name)}
      />
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="user-name">Name</Label>
          <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-email">Email Address</Label>
          <Input id="user-email" value={user.email} disabled />
          <p className="text-xs text-muted-foreground">
            Users change their own email address in their profile.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function RoleAndAccessSection({ user, isSelf }: { user: User; isSelf: boolean }) {
  const pending = isPendingInvitation(user);
  const { data: projects = [], isLoading: isLoadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get('/projects')).data.projects as Project[],
  });
  const update = useUserMutation(
    (data: { role?: UserRole; isActive?: boolean; defaultProjectIds?: string[] }) =>
      api.patch(`/users/${user.id}`, data),
    'User updated',
    'Failed to update the user'
  );
  const selectedProjectIds = new Set((user.defaultProjects ?? []).map((project) => project.id));
  const canReceiveProjects = user.isActive && !pending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Role and Access</CardTitle>
        <CardDescription>What this user can see and do</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="user-role">Role</Label>
          <Select
            value={user.role}
            onValueChange={(value) => {
              const role = (Object.keys(ROLE_LABELS) as UserRole[]).find((key) => key === value);
              if (role) update.mutate({ role });
            }}
            disabled={isSelf || pending || update.isPending}
          >
            <SelectTrigger id="user-role" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isSelf && (
            <p className="text-xs text-muted-foreground">You cannot change your own role.</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="user-active">Active</Label>
            <p className="text-xs text-muted-foreground">
              Inactive users cannot sign in or use API tokens.
            </p>
          </div>
          <Switch
            id="user-active"
            checked={user.isActive}
            onCheckedChange={(isActive) => update.mutate({ isActive })}
            disabled={isSelf || pending || update.isPending}
          />
        </div>

        <div className="space-y-2">
          <Label>Default Projects</Label>
          <p className="text-xs text-muted-foreground">
            New reports from selected projects are assigned to {user.name}.
            {!canReceiveProjects &&
              ' The user must be active and have accepted their invitation before new projects can be added.'}
          </p>
          <ScrollArea className="max-h-60 rounded-md border" contentClassName="p-2">
            {isLoadingProjects ? (
              <Spinner className="mx-auto my-4 text-primary" />
            ) : projects.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">No projects available.</p>
            ) : (
              projects.map((project) => {
                const checked = selectedProjectIds.has(project.id);
                return (
                  <label
                    key={project.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={checked}
                      disabled={(!checked && !canReceiveProjects) || update.isPending}
                      onCheckedChange={(next) => {
                        const ids = next
                          ? [...selectedProjectIds, project.id]
                          : [...selectedProjectIds].filter((id) => id !== project.id);
                        update.mutate({ defaultProjectIds: ids });
                      }}
                    />
                    <span className="flex-1">{project.name}</span>
                  </label>
                );
              })
            )}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}

function TemporaryPasswordDialog({
  user,
  open,
  onOpenChange,
}: {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [password, setPassword] = useState('');
  const save = useUserMutation(
    () => api.post(`/users/${user.id}/temporary-password`, { password }),
    'Temporary password set',
    'Failed to set the temporary password',
    () => onOpenChange(false)
  );

  useEffect(() => {
    if (open) setPassword('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set a temporary password</DialogTitle>
          <DialogDescription>
            {user.name} signs in with this password once and must then choose a new one. Their
            current sessions end.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(undefined);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="temporary-password">Temporary password</Label>
            <Input
              id="temporary-password"
              type="text"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Share it with {user.name} through a channel you trust. The password policy applies.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!password || save.isPending}>
              {save.isPending && <Spinner size="sm" className="mr-2" />}
              Set Password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SignInSection({
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
    <Card>
      <CardHeader>
        <CardTitle>Sign-in and Security</CardTitle>
        <CardDescription>Help this user sign in and end access when needed</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
              description="Emails a link to choose a new password. The link works once and expires after 24 hours."
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
                    description: `This removes the authenticator app, passkeys and recovery codes of ${user.name}. If a two-factor policy applies, they set up a new method at their next sign-in.`,
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
      </CardContent>
      <TemporaryPasswordDialog user={user} open={temporaryOpen} onOpenChange={setTemporaryOpen} />
    </Card>
  );
}

function ApiAccessSection({
  user,
  confirm,
}: {
  user: User;
  confirm: (confirmation: Confirmation) => void;
}) {
  const queryClient = useQueryClient();
  const { data: features, isLoading: isLoadingFeatures } = useQuery({
    queryKey: ['license-features'],
    queryFn: licenseApi.getFeatures,
  });
  const licensed = features?.features['api-access'] ?? false;
  const tokensKey = ['users', user.id, 'api-tokens'];
  const { data: tokens = [], isLoading: isLoadingTokens } = useQuery({
    queryKey: tokensKey,
    queryFn: async () => (await api.get(`/users/${user.id}/api-tokens`)).data.tokens as ApiToken[],
    enabled: licensed,
  });
  const refreshTokens = () => queryClient.invalidateQueries({ queryKey: tokensKey });
  const setAccess = useUserMutation(
    (enabled: boolean) => api.patch(`/users/${user.id}/api-access`, { enabled }),
    'API access updated',
    'Failed to update API access',
    refreshTokens
  );
  const revokeAll = useUserMutation(
    () => api.delete(`/users/${user.id}/api-tokens`),
    'API tokens revoked',
    'Failed to revoke API tokens',
    refreshTokens
  );

  if (isLoadingFeatures) {
    return (
      <Card>
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!licensed) {
    return (
      <UpgradePrompt
        feature="api-access"
        title="API Access"
        description="Let individual users create API tokens for scripts and integrations, and revoke them centrally."
      />
    );
  }

  const isAdmin = user.role === 'admin';

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Access</CardTitle>
        <CardDescription>Tokens can never exceed what the user's role allows</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="user-api-access">Allow API tokens</Label>
            <p className="text-xs text-muted-foreground">
              {isAdmin
                ? 'Admins always have API access.'
                : 'Turning this off revokes all of their tokens.'}
            </p>
          </div>
          <Switch
            id="user-api-access"
            checked={isAdmin || !!user.apiAccessEnabled}
            disabled={isAdmin || setAccess.isPending}
            onCheckedChange={(enabled) => {
              if (enabled || tokens.length === 0) {
                setAccess.mutate(enabled);
                return;
              }
              confirm({
                title: 'Turn off API access',
                description: `This revokes ${tokens.length} active token${tokens.length === 1 ? '' : 's'} of ${user.name}. Scripts using them stop working immediately.`,
                action: 'Turn Off',
                destructive: true,
                onConfirm: () => setAccess.mutate(false),
              });
            }}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium">Active tokens</p>
            <Button
              variant="outline-destructive"
              size="sm"
              disabled={tokens.length === 0 || revokeAll.isPending}
              onClick={() =>
                confirm({
                  title: 'Revoke all tokens',
                  description: `Scripts using the tokens of ${user.name} stop working immediately.`,
                  action: 'Revoke All',
                  destructive: true,
                  onConfirm: () => revokeAll.mutate(undefined),
                })
              }
            >
              Revoke All
            </Button>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Last used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingTokens ? (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Spinner className="mx-auto text-primary" />
                    </TableCell>
                  </TableRow>
                ) : tokens.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No active tokens
                    </TableCell>
                  </TableRow>
                ) : (
                  tokens.map((token) => (
                    <TableRow key={token.id}>
                      <TableCell className="font-medium">{token.name}</TableCell>
                      <TableCell>{scopeLabel(token.scopes)}</TableCell>
                      <TableCell>{formatDate(token.expiresAt)}</TableCell>
                      <TableCell>{formatDate(token.lastUsedAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DeleteSection({
  user,
  isSelf,
  confirm,
}: {
  user: User;
  isSelf: boolean;
  confirm: (confirmation: Confirmation) => void;
}) {
  const navigate = useNavigate();
  const remove = useUserMutation(
    () => api.delete(`/users/${user.id}`),
    'User deleted',
    'Failed to delete the user',
    () => navigate('/settings/users')
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delete User</CardTitle>
        <CardDescription>Removes the account. Reports they created stay.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="destructive"
          disabled={isSelf || remove.isPending}
          onClick={() =>
            confirm({
              title: 'Delete user',
              description: `Delete ${user.name} (${user.email})? This cannot be undone.`,
              action: 'Delete',
              destructive: true,
              onConfirm: () => remove.mutate(undefined),
            })
          }
        >
          Delete User
        </Button>
        {isSelf && (
          <p className="mt-2 text-xs text-muted-foreground">You cannot delete your own account.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data.users as User[],
  });
  const user = users?.find((candidate) => candidate.id === id);

  const backLink = (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link to="/settings/users">
        <ArrowLeft />
        All Users
      </Link>
    </Button>
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!user) {
    return (
      <>
        {backLink}
        <Alert>
          <AlertDescription>This user does not exist or was deleted.</AlertDescription>
        </Alert>
      </>
    );
  }

  const isSelf = user.id === currentUser?.id;

  return (
    <>
      {backLink}
      <div className="flex items-center gap-4">
        <Avatar className="h-14 w-14">
          {user.avatarUrl ? (
            <AvatarImage src={user.avatarUrl} alt={user.name} />
          ) : (
            <AvatarFallback className="bg-bugpin-primary-100 text-lg text-bugpin-primary-700 dark:bg-bugpin-primary-900 dark:text-bugpin-primary-300">
              {user.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="min-w-0 space-y-1">
          <h2 className="truncate text-xl font-semibold">{user.name}</h2>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
            {isPendingInvitation(user) ? (
              <Badge variant="outline" className="status-pending">
                Pending
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className={user.isActive ? 'status-active' : 'status-inactive'}
              >
                {user.isActive ? 'Active' : 'Inactive'}
              </Badge>
            )}
            {user.twoFactorEnabled && <Badge variant="secondary">2FA</Badge>}
            {isSelf && <Badge variant="outline">You</Badge>}
          </div>
        </div>
      </div>

      <AccountSection user={user} />
      <RoleAndAccessSection user={user} isSelf={isSelf} />
      <SignInSection user={user} isSelf={isSelf} confirm={setConfirmation} />
      <ApiAccessSection user={user} confirm={setConfirmation} />
      <DeleteSection user={user} isSelf={isSelf} confirm={setConfirmation} />

      <AlertDialog open={!!confirmation} onOpenChange={(open) => !open && setConfirmation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmation?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirmation?.destructive ? 'outline-destructive' : 'default'}
              onClick={() => {
                confirmation?.onConfirm();
                setConfirmation(null);
              }}
            >
              {confirmation?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
