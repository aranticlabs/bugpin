import { SectionCard, SectionLoading } from '../../components/settings/SectionCard';
import {
  DiagnosticsSettingsForm,
  resolveDiagnosticSettings,
} from '../../components/DiagnosticsSettingsForm';
import type { DiagnosticSettings } from '@shared/types';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { useDraft, useSettings, useUpdateSettings } from '../../hooks/useSettings';
import { changedFields } from '../../lib/changedFields';

export function Diagnostics() {
  const { data: settings, isLoading } = useSettings();
  const draft = useDraft<DiagnosticSettings>(
    settings && resolveDiagnosticSettings(settings.diagnostics ?? {})
  );
  const mutation = useUpdateSettings({
    successMessage: 'Diagnostics settings saved successfully',
  });

  if (isLoading || !settings || !draft.value) {
    return (
      <SectionCard section="diagnostics">
        <SectionLoading />
      </SectionCard>
    );
  }

  const value = draft.value;

  const save = async () => {
    try {
      await mutation.mutateAsync({ diagnostics: draft.changes });
      draft.reset();
      return true;
    } catch {
      return false;
    }
  };

  return (
    <SectionCard section="diagnostics">
      <UnsavedChangesGuard isDirty={draft.isDirty} onSave={save} onDiscard={draft.reset} />
      <div className="space-y-4">
        <DiagnosticsSettingsForm
          value={value}
          onChange={(next) => draft.patch(changedFields(resolveDiagnosticSettings(next), value))}
          euPrivacyMode={settings.privacy?.euPrivacyMode}
          disabled={mutation.isPending}
        />
      </div>
    </SectionCard>
  );
}
