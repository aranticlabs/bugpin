import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { licenseApi } from '../../api/license';
import { formatShortDate, formatTokenScope } from '../../lib/format';
import { UpgradePrompt } from '../UpgradePrompt';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Label } from '../ui/label';
import { SettingsCard } from '../ui/settings-card';
import { Spinner } from '../ui/spinner';
import { Switch } from '../ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import type { Confirmation } from './ConfirmActionDialog';
import { useUserMutation } from './useUserMutation';
import type { ApiToken, User } from '@shared/types';

function formatOptionalDate(value?: string): string {
  return value ? formatShortDate(value) : 'Never';
}

export function UserApiAccessSection({
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
        title="API Access"
        description="Let individual users create API tokens for scripts and integrations, and revoke them centrally."
      />
    );
  }

  const isAdmin = user.role === 'admin';

  return (
    <SettingsCard
      title="API Access"
      description="Tokens can never exceed what the user's role allows"
    >
      <div className="space-y-6">
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
                      <TableCell>{formatTokenScope(token.scopes)}</TableCell>
                      <TableCell>{formatOptionalDate(token.expiresAt)}</TableCell>
                      <TableCell>{formatOptionalDate(token.lastUsedAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
