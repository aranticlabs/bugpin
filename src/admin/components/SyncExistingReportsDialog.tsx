import { useState } from 'react';
import { useSyncExistingReports } from '../hooks/useIntegrations';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Spinner } from './ui/spinner';
import { cn } from '../lib/utils';

type SyncOption = 'all' | 'future';

interface SyncExistingReportsDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (syncExisting: boolean) => void;
  integrationId: string;
  unsyncedCount: number;
}

export function SyncExistingReportsDialog({
  open,
  onClose,
  onConfirm,
  integrationId,
  unsyncedCount,
}: SyncExistingReportsDialogProps) {
  const [syncOption, setSyncOption] = useState<SyncOption>('future');
  const syncMutation = useSyncExistingReports();

  const options: { value: SyncOption; title: string; description: string }[] = [
    ...(unsyncedCount > 0
      ? [
          {
            value: 'all' as const,
            title: 'Sync all existing reports',
            description: `Queue ${unsyncedCount} existing report${unsyncedCount > 1 ? 's' : ''} for sync`,
          },
        ]
      : []),
    {
      value: 'future',
      title: 'Only sync future reports',
      description: 'Only new reports will be synced to GitHub',
    },
  ];

  const handleConfirm = async () => {
    if (syncOption === 'all' && unsyncedCount > 0) {
      await syncMutation.mutateAsync({
        id: integrationId,
        reportIds: 'all',
      });
    }
    onConfirm(syncOption === 'all');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enable Automatic Sync</DialogTitle>
          <DialogDescription>
            Automatic sync will create GitHub issues for all new reports.
            {unsyncedCount > 0 && (
              <>
                {' '}
                You have {unsyncedCount} existing report{unsyncedCount > 1 ? 's' : ''} not yet
                synced to GitHub.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2 py-4">
          <legend className="sr-only">Which reports to sync</legend>
          {options.map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-focus-visible:focus-ring',
                syncOption === option.value
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-primary-tint'
              )}
            >
              <input
                type="radio"
                name="sync-option"
                value={option.value}
                checked={syncOption === option.value}
                onChange={() => setSyncOption(option.value)}
                className="mt-0.5 size-4 shrink-0 accent-primary outline-none"
              />
              <span className="flex-1 space-y-0.5">
                <span className="block text-sm font-medium">{option.title}</span>
                <span className="block text-sm text-muted-foreground">{option.description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={syncMutation.isPending}>
            {syncMutation.isPending ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Syncing...
              </>
            ) : (
              'Enable Automatic Sync'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
