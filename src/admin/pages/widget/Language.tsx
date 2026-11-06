import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Spinner } from '../../components/ui/spinner';
import { LanguageSettingsForm } from '../../components/LanguageSettingsForm';
import {
  SectionCard,
  SectionLoading,
  SettingsFormActions,
} from '../../components/settings/SectionCard';
import type { AppSettings, ProjectLanguageSettings } from '@shared/types';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';

export function Language() {
  const {
    data: settings,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.settings as AppSettings;
    },
  });

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
  const queryClient = useQueryClient();
  const [language, setLanguage] = useState<ProjectLanguageSettings>(savedLanguage);
  const isDirty = JSON.stringify(language) !== JSON.stringify(savedLanguage);

  const mutation = useMutation({
    mutationFn: async (data: Partial<AppSettings>) => {
      const response = await api.put('/settings', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Language settings saved successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    },
  });

  return (
    <SectionCard section="language" showHeader={false}>
      <UnsavedChangesGuard isDirty={isDirty} onSave={() => mutation.mutateAsync({ language })} />
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate({ language });
        }}
      >
        <LanguageSettingsForm
          value={language}
          onChange={setLanguage}
          disabled={mutation.isPending}
        />
        <SettingsFormActions isPending={mutation.isPending} isDirty={isDirty} />
      </form>
    </SectionCard>
  );
}
