import { SectionCard, SectionLoading } from '../../components/settings/SectionCard';
import { ScreenshotSettingsForm } from '../../components/ScreenshotSettingsForm';
import type { AppSettings, ScreenshotSettings } from '@shared/types';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { useDraft, useSettings, useUpdateSettings } from '../../hooks/useSettings';
import { changedFields } from '../../lib/changedFields';

const fromSettings = (stored: Partial<AppSettings['screenshot']> = {}): ScreenshotSettings => ({
  maxScreenshotSize: stored.maxScreenshotSize || 10,
  maxImageUploadSizeMb: stored.maxImageUploadSizeMb || 10,
  useScreenCaptureAPI: stored.useScreenCaptureAPI || false,
});

export function Screenshot() {
  const { data: settings, isLoading } = useSettings();
  const draft = useDraft<ScreenshotSettings>(settings && fromSettings(settings.screenshot));
  const mutation = useUpdateSettings({
    successMessage: 'Screenshot settings saved successfully',
  });

  // Screenshot and recording settings share one stored object, so only the changed screenshot
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
      <SectionCard section="screenshot">
        <SectionLoading />
      </SectionCard>
    );
  }

  const value = draft.value;

  return (
    <SectionCard section="screenshot">
      <UnsavedChangesGuard isDirty={draft.isDirty} onSave={save} onDiscard={draft.reset} />
      <div className="space-y-6">
        <ScreenshotSettingsForm
          value={value}
          onChange={(next) => draft.patch(changedFields(next, value))}
          disabled={mutation.isPending}
        />
      </div>
    </SectionCard>
  );
}
