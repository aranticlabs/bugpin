import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Download } from 'lucide-react';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

function RecoveryCodesList({ codes }: { codes: string[] }) {
  const text = codes.join('\n');

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    toast.success('Recovery codes copied');
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([`${text}\n`], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bugpin-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-4 font-mono text-sm">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
          Copy all
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Download .txt
        </Button>
      </div>
    </div>
  );
}

/** Shows new recovery codes once; it closes only after the user confirms saving them */
export function RecoveryCodesDialog({
  codes,
  onDone,
}: {
  codes: string[] | null;
  onDone: () => void;
}) {
  const [saved, setSaved] = useState(false);

  const finish = () => {
    setSaved(false);
    onDone();
  };

  return (
    <Dialog open={codes !== null} onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Save your recovery codes</DialogTitle>
          <DialogDescription>
            Each code signs you in once if you lose access to your authenticator app or passkeys.
            They will not be shown again.
          </DialogDescription>
        </DialogHeader>
        {codes && <RecoveryCodesSaveStep codes={codes} saved={saved} onSavedChange={setSaved} />}
        <DialogFooter>
          <Button type="button" onClick={finish} disabled={!saved}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RecoveryCodesSaveStep({
  codes,
  saved,
  onSavedChange,
}: {
  codes: string[];
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <RecoveryCodesList codes={codes} />
      <div className="flex items-center gap-2">
        <Checkbox
          id="recovery-codes-saved"
          checked={saved}
          onCheckedChange={(checked) => onSavedChange(checked === true)}
        />
        <Label htmlFor="recovery-codes-saved">I saved my recovery codes</Label>
      </div>
    </div>
  );
}
