import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Button } from './ui/button';
import { Spinner } from './ui/spinner';

interface UnsavedChangesDialogProps {
  open: boolean;
  description: string;
  /** Rejects or resolves to false when saving failed, which cancels the action. */
  onSave: () => Promise<unknown>;
  onSaved: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedChangesDialog({
  open,
  description,
  onSave,
  onSaved,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    let saved: boolean;
    try {
      saved = (await onSave()) !== false;
    } catch {
      saved = false;
    }
    setIsSaving(false);
    if (saved) {
      onSaved();
    } else {
      onCancel();
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isSaving) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="outline-destructive"
            disabled={isSaving}
            onClick={onDiscard}
          >
            Discard changes
          </Button>
          <Button type="button" disabled={isSaving} onClick={() => void handleSave()}>
            {isSaving ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Saving...
              </>
            ) : (
              'Save changes'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
