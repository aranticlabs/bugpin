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

  return (
    <SectionCard section="recording">
      <UnsavedChangesGuard isDirty={draft.isDirty} onSave={save} onDiscard={draft.reset} />
      <div className="space-y-6">
        <RecordingSettingsForm
          value={value}
          onChange={(next) => draft.patch(changedFields(next, value))}
          disabled={mutation.isPending}
        />
      </div>
    </SectionCard>
  );
}
