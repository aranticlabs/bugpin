import { DEFAULT_RECORDING_QUALITY } from '@shared/recording-quality';
import { SectionCard, SectionLoading } from '../../components/settings/SectionCard';
import { RecordingSettingsForm } from '../../components/RecordingSettingsForm';
import type { AppSettings, ScreenshotSettings } from '@shared/types';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { useDraft, useSettings, useUpdateSettings } from '../../hooks/useSettings';
import { changedFields } from '../../lib/changedFields';

const fromSettings = (stored: Partial<AppSettings['screenshot']> = {}): ScreenshotSettings => ({
  maxVideoUploadSizeMb: stored.maxVideoUploadSizeMb || 50,
  maxVideoUploadMbPerDay: stored.maxVideoUploadMbPerDay ?? 2048,
  enableScreenRecording: stored.enableScreenRecording ?? false,
  allowRecordingMicrophone: stored.allowRecordingMicrophone ?? false,
  maxRecordingDurationSeconds: stored.maxRecordingDurationSeconds ?? 180,
  recordingQuality: stored.recordingQuality ?? DEFAULT_RECORDING_QUALITY,
});

export function Recording() {
  const { data: settings, isLoading } = useSettings();
  const draft = useDraft<ScreenshotSettings>(settings && fromSettings(settings.screenshot));
  const mutation = useUpdateSettings({
    successMessage: 'Recording settings saved successfully',
  });

  // Recording and screenshot settings share one stored object, so only the changed recording
  // fields are sent and the server merges them into it.
  const save = async () => {
    try {
      await mutation.mutateAsync({ screenshot: draft.changes });
      draft.reset();
      return true;
    } catch {
      return false;
    }
  };

  if (isLoading || !draft.value) {
    return (
      <SectionCard section="recording">
        <SectionLoading />
      </SectionCard>
    );
  }

  const value = draft.value;

  const handleChange = (next: ScreenshotSettings) => {
    const changes = changedFields(next, value);
    draft.patch(changes);
    // The on/off switch saves by itself: while recording is off the form is locked, so it could
    // not be saved afterwards. Only the switch is sent, other unsaved edits stay in the draft.
    if (changes.enableScreenRecording !== undefined) {
      const enabled = changes.enableScreenRecording;
      mutation.mutate({
        screenshot: {
          enableScreenRecording: enabled,
          ...(enabled ? {} : { allowRecordingMicrophone: false }),
        },
      });
    }
  };

  return (
    <SectionCard section="recording">
      <UnsavedChangesGuard
        isDirty={draft.isDirty && !!value.enableScreenRecording}
        onSave={save}
        onDiscard={draft.reset}
      />
      <div className="space-y-6">
        <RecordingSettingsForm
          value={value}
          onChange={handleChange}
          disabled={mutation.isPending}
        />
      </div>
    </SectionCard>
  );
}
