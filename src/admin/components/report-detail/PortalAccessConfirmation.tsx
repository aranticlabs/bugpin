import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export function PortalAccessConfirmation({
  open,
  busy,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant portal access?</DialogTitle>
          <DialogDescription>
            Sending this message lets the contact email claim this report after signing in. The
            reporter will be able to read the report and its visible conversation in the portal.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={onConfirm}>
            {busy ? 'Sending...' : 'Grant access and send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
