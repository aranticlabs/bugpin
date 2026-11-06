import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { brandingApi } from '../../api/branding';
import {
  SectionCard,
  SectionLoading,
  SettingsFormActions,
} from '../../components/settings/SectionCard';
import {
  WidgetDialogSettingsForm,
  resolveDialogColors,
} from '../../components/WidgetDialogSettingsForm';
import {
  DialogPreviewCard,
  SettingsWithPreview,
} from '../../components/widget/WidgetSettingsLayout';
import type { ThemeColors } from '@shared/types';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';

const DEFAULT_WIDGET_COLORS: ThemeColors = {
  lightButtonColor: '#02658D',
  lightTextColor: '#ffffff',
  lightButtonHoverColor: '#024F6F',
  lightTextHoverColor: '#ffffff',
  lightBackgroundColor: '#ffffff',
  lightSecondaryColor: '#f5f5f5',
  lightInputColor: '#ffffff',
  lightForegroundColor: '#0a0a0a',
  darkButtonColor: '#02658D',
  darkTextColor: '#ffffff',
  darkButtonHoverColor: '#036F9B',
  darkTextHoverColor: '#ffffff',
  darkBackgroundColor: '#0a0a0a',
  darkSecondaryColor: '#262626',
  darkInputColor: '#1a1a1a',
  darkForegroundColor: '#fafafa',
};

export function Dialog() {
  const queryClient = useQueryClient();
  // Track local edits separately - null means use config values
  const [localEdits, setLocalEdits] = useState<Partial<ThemeColors> | null>(null);

  const { data: config, isLoading } = useQuery({
    queryKey: ['branding-config'],
    queryFn: brandingApi.getConfig,
  });

  const mutation = useMutation({
    mutationFn: brandingApi.updateWidgetPrimaryColors,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branding-config'] });
      setLocalEdits(null); // Clear local edits after save
      toast.success('Widget dialog colors updated');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to update widget dialog colors');
    },
  });

  // Use local edits if user has made changes, otherwise use config directly
  const displayColors = localEdits ?? config?.widgetPrimaryColors ?? DEFAULT_WIDGET_COLORS;

  const handleChange = (newColors: Partial<ThemeColors>) => {
    setLocalEdits(newColors);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(displayColors as ThemeColors);
  };

  const handleReset = () => {
    setLocalEdits(DEFAULT_WIDGET_COLORS);
  };

  const isDirty =
    localEdits !== null &&
    JSON.stringify(localEdits) !== JSON.stringify(config?.widgetPrimaryColors);

  // Wait for config to fully load before rendering the form
  if (isLoading || !config?.widgetPrimaryColors) {
    return (
      <SectionCard section="dialog" showHeader={false}>
        <SectionLoading />
      </SectionCard>
    );
  }

  return (
    <SettingsWithPreview
      placement="below"
      preview={<DialogPreviewCard colors={resolveDialogColors(displayColors)} />}
    >
      <SectionCard section="dialog" showHeader={false}>
        <UnsavedChangesGuard
          isDirty={isDirty}
          onSave={() => mutation.mutateAsync(displayColors as ThemeColors)}
        />
        <form onSubmit={handleSubmit} className="space-y-6">
          <WidgetDialogSettingsForm
            value={displayColors}
            onChange={handleChange}
            disabled={mutation.isPending}
          />
          <SettingsFormActions
            isPending={mutation.isPending}
            isDirty={isDirty}
            onReset={handleReset}
          />
        </form>
      </SectionCard>
    </SettingsWithPreview>
  );
}
