import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Spinner } from '../ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { useUserMutation } from './useUserMutation';
import type { User } from '@shared/types';

export function TemporaryPasswordDialog({
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
            current sessions end and their API tokens are revoked.
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
