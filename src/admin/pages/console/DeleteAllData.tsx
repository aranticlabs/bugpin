import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Spinner } from '../../components/ui/spinner';

const CONFIRMATION_WORD = 'delete';

export function DeleteAllData() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await api.delete('/settings/data', {
        data: { confirmation: CONFIRMATION_WORD },
      });
      return response.data as { deleted: number };
    },
    onSuccess: ({ deleted }) => {
      queryClient.invalidateQueries();
      toast.success(`Deleted ${deleted} ${deleted === 1 ? 'report' : 'reports'}`);
      handleOpenChange(false);
    },
    onError: (error: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Failed to delete data');
    },
  });

  const handleOpenChange = (next: boolean) => {
    if (mutation.isPending) return;
    setOpen(next);
    if (!next) setConfirmation('');
  };

  const confirmed = confirmation.trim().toLowerCase() === CONFIRMATION_WORD;

  return (
    <>
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle>Delete All Data</CardTitle>
          <CardDescription>
            Permanently delete every report and its files, such as screenshots, recordings and
            attachments, from all projects.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Deletion takes effect immediately and cannot be undone. Projects, users and settings are
            kept.
          </p>
          <Button variant="destructive" onClick={() => setOpen(true)}>
            Delete All Data
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all data?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes all reports and their files from every project, effective
              immediately. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-all-confirmation">
              Type <span className="font-mono font-semibold">{CONFIRMATION_WORD}</span> to confirm
            </Label>
            <Input
              id="delete-all-confirmation"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className="placeholder:font-mono"
              placeholder={CONFIRMATION_WORD}
              autoComplete="off"
              disabled={mutation.isPending}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!confirmed || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete All Data'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
