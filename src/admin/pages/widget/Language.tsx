import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Spinner } from '../../components/ui/spinner';
import { LanguageSettingsForm } from '../../components/LanguageSettingsForm';
import { SectionCard, SectionLoading } from '../../components/settings/SectionCard';
import type { ProjectLanguageSettings } from '@shared/types';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { useSettings, useUpdateSettings } from '../../hooks/useSettings';

export function Language() {
  const { data: settings, isLoading, isFetching, refetch } = useSettings();

  if (isLoading) {
    return (
      <SectionCard section="language" showHeader={false}>
        <SectionLoading />
      </SectionCard>
    );
  }

  // Never mount the form with fallback values: its state is initialized once, so a later
  // successful load would not reach it and saving would overwrite the stored language.
  if (!settings) {
    return (
      <SectionCard section="language" showHeader={false}>
        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Language settings could not be loaded. No changes can be saved until the current
              settings are available.
            </AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Retrying...
              </>
            ) : (
              'Retry'
            )}
          </Button>
        </div>
      </SectionCard>
    );
  }

  return <LanguageForm savedLanguage={settings.language} />;
}

// Mounted only once settings are loaded: the Radix Select must receive the stored value on
// its first render. Changing its value programmatically after mount (e.g. syncing state in a
// useEffect) makes its hidden native <select> emit onValueChange('') and clears the selection.
function LanguageForm({ savedLanguage }: { savedLanguage: ProjectLanguageSettings }) {
  const [language, setLanguage] = useState<ProjectLanguageSettings>(savedLanguage);
  const isDirty = JSON.stringify(language) !== JSON.stringify(savedLanguage);
  const mutation = useUpdateSettings({ successMessage: 'Language settings saved successfully' });

  // The stored language settings are replaced as a whole, so the save sends both fields.
  const save = async () => {
    try {
      await mutation.mutateAsync({ language });
      return true;
    } catch {
      return false;
    }
  };

  return (
    <SectionCard section="language" showHeader={false}>
      <UnsavedChangesGuard
        isDirty={isDirty}
        onSave={save}
        onDiscard={() => setLanguage(savedLanguage)}
      />
      <div className="space-y-6">
        <LanguageSettingsForm
          value={language}
          onChange={setLanguage}
          disabled={mutation.isPending}
        />
      </div>
    </SectionCard>
  );
}
