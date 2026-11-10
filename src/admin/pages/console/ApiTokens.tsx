import { useId, useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Copy, Plus, Check } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { licenseApi } from '../../api/license';
import { useAuth } from '../../contexts/AuthContext';
import { SettingsCard } from '../../components/ui/settings-card';
import { formatShortDate, formatTokenScope } from '../../lib/format';
import { Button } from '../../components/ui/button';
import { UpgradePrompt } from '../../components/UpgradePrompt';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Spinner } from '../../components/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '../../components/ui/alert-dialog';
import type { ApiToken, ApiTokenScope } from '@shared/types';

interface TokenForm {
  name: string;
  scope: ApiTokenScope;
  days: string;
}

interface CreatedToken {
  token: ApiToken;
  rawToken: string;
}

const DEFAULT_FORM: TokenForm = { name: '', scope: 'read', days: '30' };

function errorMessage(error: Error): string {
  return axios.isAxiosError(error) ? error.response?.data?.message || error.message : error.message;
}

export function ApiTokens() {
  const formId = useId();
  const { user } = useAuth();
  const client = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [fields, setFields] = useState<TokenForm>(DEFAULT_FORM);
  const [createdToken, setCreatedToken] = useState<CreatedToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [tokenToRevoke, setTokenToRevoke] = useState<ApiToken | null>(null);
  const {
    data: license,
    isLoading: licenseLoading,
    error: licenseError,
    refetch: refetchLicense,
  } = useQuery({
    queryKey: ['license-features'],
    queryFn: licenseApi.getFeatures,
  });
  const enabled = license?.features['api-access'] ?? false;
  const {
    data: tokens,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['api-tokens'],
    queryFn: async () => (await api.get('/tokens')).data.tokens as ApiToken[],
    enabled,
  });
  const create = useMutation({
    mutationFn: async (form: TokenForm) =>
      (
        await api.post('/tokens', {
          name: form.name.trim(),
          scopes: [form.scope],
          expiresInDays: Number(form.days),
        })
      ).data as CreatedToken,
    onSuccess: (result) => {
      setCreatedToken(result);
      setFields(DEFAULT_FORM);
      client.setQueryData<ApiToken[]>(['api-tokens'], (current) => [
        result.token,
        ...(current ?? []).filter((token) => token.id !== result.token.id),
      ]);
      void client.invalidateQueries({ queryKey: ['api-tokens'] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/tokens/${id}`),
    onSuccess: (_, id) => {
      setTokenToRevoke(null);
      client.setQueryData<ApiToken[]>(['api-tokens'], (current) =>
        current?.filter((token) => token.id !== id)
      );
      void client.invalidateQueries({ queryKey: ['api-tokens'] });
      toast.success('API token revoked');
    },
  });

  const handleCreateOpenChange = (open: boolean) => {
    if (create.isPending) return;
    setCreateOpen(open);
    setFields(DEFAULT_FORM);
    setCreatedToken(null);
    setCopied(false);
    setCopyError('');
    create.reset();
  };

  const copyToken = async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken.rawToken);
      setCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Could not copy the token. Select it and copy it manually.');
    }
  };

  if (licenseLoading) return <Spinner className="mx-auto" />;
  if (licenseError)
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive">
          Unable to load API token access.
        </p>
        <Button variant="outline" onClick={() => void refetchLicense()}>
          Retry
        </Button>
      </div>
    );
  if (!enabled)
    return (
      <UpgradePrompt
        title="API tokens"
        description="Connect scripts and integrations to BugPin with scoped API tokens. Manage access, expiration, and revocation for your account."
      />
    );

  return (
    <>
      <SettingsCard
        title="API tokens"
        description="Manage access for scripts and integrations connected to your account."
        action={
          <Button onClick={() => handleCreateOpenChange(true)}>
            <Plus className="h-4 w-4" />
            Create token
          </Button>
        }
      >
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">
              Unable to load your API tokens. {errorMessage(error)}
            </p>
            <Button variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : !tokens?.length ? (
          <div className="space-y-1 py-8 text-center">
            <p className="text-sm font-medium">No API tokens yet</p>
            <p className="text-sm text-muted-foreground">
              Create a token to connect a script or integration.
            </p>
          </div>
        ) : (
          <Table aria-label="API tokens">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((token) => {
                const expired =
                  !!token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now();
                return (
                  <TableRow key={token.id}>
                    <TableCell>
                      <p className="max-w-48 break-words font-medium">{token.name}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {token.tokenPrefix}…
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatTokenScope(token.scopes)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {token.lastUsedAt ? formatShortDate(token.lastUsedAt) : 'Never'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {token.expiresAt ? formatShortDate(token.expiresAt) : 'No expiration'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={expired ? 'secondary' : 'outline'}>
                        {expired ? 'Expired' : 'Active'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline-destructive"
                        size="sm"
                        aria-label={`Revoke ${token.name}`}
                        onClick={() => {
                          revoke.reset();
                          setTokenToRevoke(token);
                        }}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </SettingsCard>

      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent
          className="max-h-[90vh]"
          onEscapeKeyDown={(event) => {
            if (createdToken) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (createdToken) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>{createdToken ? 'API token created' : 'Create API token'}</DialogTitle>
            <DialogDescription>
              {createdToken
                ? `Copy the token for "${createdToken.token.name}" now. You will not be able to view it again.`
                : 'Choose a name, access scope, and expiration for this token.'}
            </DialogDescription>
          </DialogHeader>
          {createdToken ? (
            <>
              <DialogBody contentClassName="space-y-2">
                <Label htmlFor={`${formId}-token`}>New API token</Label>
                <Input
                  id={`${formId}-token`}
                  className="font-mono"
                  value={createdToken.rawToken}
                  readOnly
                  onFocus={(event) => event.target.select()}
                />
                {copyError && (
                  <p role="alert" className="text-sm text-destructive">
                    {copyError}
                  </p>
                )}
              </DialogBody>
              <DialogFooter className="gap-2 sm:space-x-0">
                <Button variant="outline" onClick={() => void copyToken()}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy token'}
                </Button>
                <Button onClick={() => handleCreateOpenChange(false)}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <form
              className="flex min-h-0 flex-col gap-4"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                if (!create.isPending) create.mutate(fields);
              }}
            >
              <DialogBody contentClassName="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`${formId}-name`}>Token name</Label>
                  <Input
                    id={`${formId}-name`}
                    name="name"
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="e.g. CI integration"
                    value={fields.name}
                    disabled={create.isPending}
                    onChange={(event) => setFields({ ...fields, name: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${formId}-scope`}>Scope</Label>
                  <Select
                    name="scope"
                    value={fields.scope}
                    disabled={create.isPending}
                    onValueChange={(value) => {
                      if (value === 'read' || value === 'write' || value === 'admin')
                        setFields({ ...fields, scope: value });
                    }}
                  >
                    <SelectTrigger id={`${formId}-scope`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="read">Read</SelectItem>
                      {user?.role !== 'viewer' && (
                        <SelectItem value="write">Read and write</SelectItem>
                      )}
                      {user?.role === 'admin' && <SelectItem value="admin">Admin</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${formId}-days`}>Expires in days</Label>
                  <Input
                    id={`${formId}-days`}
                    name="days"
                    type="number"
                    min={1}
                    max={365}
                    required
                    value={fields.days}
                    disabled={create.isPending}
                    onChange={(event) => setFields({ ...fields, days: event.target.value })}
                  />
                </div>
                {create.error && (
                  <p role="alert" className="text-sm text-destructive">
                    {errorMessage(create.error)}
                  </p>
                )}
              </DialogBody>
              <DialogFooter className="gap-2 sm:space-x-0">
                <Button
                  type="button"
                  variant="outline"
                  disabled={create.isPending}
                  onClick={() => handleCreateOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending && <Spinner size="sm" className="mr-2" />}
                  {create.isPending ? 'Creating...' : 'Create token'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!tokenToRevoke}
        onOpenChange={(open) => {
          if (!open && !revoke.isPending) setTokenToRevoke(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API token?</AlertDialogTitle>
            <AlertDialogDescription>
              Any integration using "{tokenToRevoke?.name}" will lose access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {revoke.error && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(revoke.error)}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoke.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="outline-destructive"
              disabled={revoke.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (tokenToRevoke && !revoke.isPending) revoke.mutate(tokenToRevoke.id);
              }}
            >
              {revoke.isPending ? 'Revoking...' : 'Revoke token'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
