import { useState } from 'react';
import { UnsavedChangesDialog } from '../components/UnsavedChangesDialog';

interface ConfirmUnsavedChangesOptions {
  isDirty: boolean;
  /** Rejects or resolves to false when saving failed, which cancels the switch. */
  onSave: () => Promise<unknown>;
}

/**
 * Guards an in-page switch that replaces the form, such as picking another item to edit. With
 * unsaved changes, confirm() asks to save or discard them before running the switch.
 */
export function useConfirmUnsavedChanges({ isDirty, onSave }: ConfirmUnsavedChangesOptions) {
  const [pending, setPending] = useState<{ apply: () => void } | null>(null);

  const confirm = (apply: () => void) => {
    if (isDirty) {
      setPending({ apply });
    } else {
      apply();
    }
  };

  const finish = (run: boolean) => {
    if (run) pending?.apply();
    setPending(null);
  };

  const dialog = (
    <UnsavedChangesDialog
      open={pending !== null}
      description="You changed settings that are not saved yet. Save them before you switch, or discard them."
      onSave={onSave}
      onSaved={() => finish(true)}
      onDiscard={() => finish(true)}
      onCancel={() => finish(false)}
    />
  );

  return { confirm, dialog };
}
