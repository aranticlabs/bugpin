import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, getApiErrorMessage } from '../../api/client';
import { formatDateTime } from '../../lib/format';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { maskEmail } from '@shared/mask-email';
import type { Report } from '@shared/types';
import type { ReportOwner } from '@shared/reporter-types';

export function OwnerField({
  report,
  canEdit,
}: {
  report: Pick<Report, 'id' | 'owner' | 'reporterId' | 'claimableEmail'>;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('assign');
  const [email, setEmail] = useState('');
  const ownerEmail = report.owner?.reporter?.email ?? report.claimableEmail;
  const hasOwner = Boolean(report.reporterId || report.claimableEmail);

  const changed = () => {
    for (const queryKey of [
      ['report', report.id],
      ['report-history', report.id],
      ['reports'],
      ['reporters'],
      ['reporterMessages', report.id],
    ])
      void queryClient.invalidateQueries({ queryKey });
    toast.success('Owner updated');
  };
  const save = useMutation({
    mutationFn: async () => {
      let body: { reporterId: string } | { claimableEmail: string };
      const normalized = email.trim().toLowerCase();
      if (mode === 'claimable') body = { claimableEmail: normalized };
      else {
        const { data } = await api.get<{ reporter: { id: string } | null }>('/reporters/lookup', {
          params: { email: normalized },
        });
        if (!data.reporter)
          throw new Error(
            'No reporter with this email has signed in yet. Make the report claimable instead.'
          );
        body = { reporterId: data.reporter.id };
      }
      return (await api.put<{ owner: ReportOwner }>(`/reports/${report.id}/owner`, body)).data
        .owner;
    },
    onSuccess: () => {
      changed();
      setOpen(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/reports/${report.id}/owner`),
    onSuccess: changed,
  });
  const busy = save.isPending || remove.isPending;

  return (
    <div className="min-w-0 space-y-2">
      <Label className="text-muted-foreground block">Owner</Label>
      <p className="break-all text-sm">
        {ownerEmail ? maskEmail(ownerEmail) : report.reporterId ? 'Assigned reporter' : 'No owner'}
      </p>
      {report.claimableEmail && (
        <p className="text-xs text-muted-foreground">Attaches when this email signs in.</p>
      )}
      {report.owner?.reporter?.lastLoginAt && (
        <p className="text-xs text-muted-foreground">
          Last login {formatDateTime(report.owner.reporter.lastLoginAt)}
        </p>
      )}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              setEmail(ownerEmail ?? '');
              setMode(report.claimableEmail ? 'claimable' : 'assign');
              save.reset();
              setOpen(true);
            }}
          >
            Change owner
          </Button>
          {hasOwner && (
            <Button
              variant="ghost-destructive"
              size="sm"
              disabled={busy}
              onClick={() => remove.mutate()}
            >
              Remove owner
            </Button>
          )}
        </div>
      )}
      {remove.isError && (
        <p role="alert" className="text-sm text-destructive">
          {getApiErrorMessage(remove.error, 'Failed to remove owner')}
        </p>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change owner</DialogTitle>
            <DialogDescription>
              Assign a reporter who has signed in, or let an email claim this report on its next
              login.
            </DialogDescription>
          </DialogHeader>
          <form
            className="min-w-0 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy && canEdit) save.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="owner-action">Ownership</Label>
              <Select
                value={mode}
                onValueChange={(value) => {
                  setMode(value);
                  save.reset();
                }}
                disabled={busy}
              >
                <SelectTrigger id="owner-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assign">Assign existing reporter</SelectItem>
                  <SelectItem value="claimable">Make claimable by email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-email">Email address</Label>
              <Input
                id="owner-email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                disabled={busy}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {save.isError && (
              <p role="alert" className="text-sm text-destructive">
                {getApiErrorMessage(save.error, 'Failed to update owner')}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !canEdit}>
                {save.isPending ? 'Saving...' : 'Save owner'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
