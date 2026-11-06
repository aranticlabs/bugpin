import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { SectionCard, SectionLoading } from '../../components/settings/SectionCard';
import {
  DiagnosticsSettingsForm,
  resolveDiagnosticSettings,
} from '../../components/DiagnosticsSettingsForm';
import type { AppSettings, DiagnosticSettings } from '@shared/types';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';

export function Diagnostics() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.settings as AppSettings;
    },
  });

  if (isLoading || !settings) {
    return (
      <SectionCard section="diagnostics">
        <SectionLoading />
      </SectionCard>
    );
  }

  return <DiagnosticsDefaultsForm settings={settings} />;
}

function DiagnosticsDefaultsForm({ settings }: { settings: AppSettings }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState<DiagnosticSettings>(() =>
    resolveDiagnosticSettings(settings.diagnostics ?? {})
  );

  const isDirty =
    JSON.stringify(value) !== JSON.stringify(resolveDiagnosticSettings(settings.diagnostics ?? {}));

  const mutation = useMutation({
    mutationFn: async (diagnostics: DiagnosticSettings) => {
      const response = await api.put('/settings', { diagnostics });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Diagnostics settings saved successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    },
  });

  return (
    <SectionCard section="diagnostics">
      <UnsavedChangesGuard
        isDirty={isDirty}
        onSave={() => mutation.mutateAsync(value)}
        onDiscard={() => setValue(resolveDiagnosticSettings(settings.diagnostics ?? {}))}
      />
      <div className="space-y-4">
        <DiagnosticsSettingsForm
          value={value}
          onChange={(next) => setValue(resolveDiagnosticSettings(next))}
          euPrivacyMode={settings.privacy?.euPrivacyMode}
          disabled={mutation.isPending}
        />
      </div>
    </SectionCard>
  );
}
