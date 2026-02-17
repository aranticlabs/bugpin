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
import { Label } from './ui/label';
import { Spinner } from './ui/spinner';
import { CheckCircle2 } from 'lucide-react';

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
  const [syncOption, setSyncOption] = useState<'all' | 'future'>('future');
  const syncMutation = useSyncExistingReports();

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

        <div className="py-4 space-y-2">
          {unsyncedCount > 0 && (
            <button
              type="button"
              onClick={() => setSyncOption('all')}
              className={`w-full flex items-start space-x-3 p-3 rounded-lg border text-left transition-colors ${
                syncOption === 'all' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
              }`}
            >
              <div
                className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  syncOption === 'all' ? 'border-primary' : 'border-muted-foreground'
                }`}
              >
                {syncOption === 'all' && <CheckCircle2 className="h-3 w-3 text-primary" />}
              </div>
              <Label className="cursor-pointer flex-1">
                <div className="font-medium">Sync all existing reports</div>
                <p className="text-sm text-muted-foreground font-normal">
                  Queue {unsyncedCount} existing report{unsyncedCount > 1 ? 's' : ''} for sync
                </p>
              </Label>
            </button>
          )}
          <button
            type="button"
            onClick={() => setSyncOption('future')}
            className={`w-full flex items-start space-x-3 p-3 rounded-lg border text-left transition-colors ${
              syncOption === 'future' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
            }`}
          >
            <div
              className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                syncOption === 'future' ? 'border-primary' : 'border-muted-foreground'
              }`}
            >
              {syncOption === 'future' && <CheckCircle2 className="h-3 w-3 text-primary" />}
            </div>
            <Label className="cursor-pointer flex-1">
              <div className="font-medium">Only sync future reports</div>
              <p className="text-sm text-muted-foreground font-normal">
                Only new reports will be synced to GitHub
              </p>
            </Label>
          </button>
        </div>

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
