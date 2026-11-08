import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { brandingApi, type BrandingConfig } from '../../api/branding';
import { useDraft, useSettings, useUpdateSettings } from '../../hooks/useSettings';
import { apiErrorMessage } from '../../lib/apiError';
import {
  SectionCard,
  SectionLoading,
  ResetToDefaultButton,
} from '../../components/settings/SectionCard';
import {
  DEFAULT_WIDGET_COLORS,
  WidgetDialogSettingsForm,
  resolveDialogColors,
} from '../../components/WidgetDialogSettingsForm';
import {
  DialogPreviewCard,
  useColorMode,
  SettingsWithPreview,
} from '../../components/widget/WidgetSettingsLayout';
import { changedFields } from '../../lib/changedFields';
import {
  DEFAULT_DIALOG_CONTENT,
  WidgetDialogContentForm,
  dialogContentErrors,
  resolveDialogContentPreview,
} from '../../components/WidgetDialogContentForm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import type {
  GlobalWidgetDialogContentSettings,
  LocaleCode,
  ThemeColors,
  WidgetDialogContentSettings,
} from '@shared/types';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';

function toGlobalContent(next: WidgetDialogContentSettings): GlobalWidgetDialogContentSettings {
  return {
    title: next.title ?? null,
    titlePlaceholder: next.titlePlaceholder ?? null,
    descriptionPlaceholder: next.descriptionPlaceholder ?? null,
    submitButtonText: next.submitButtonText ?? null,
    showPriority: next.showPriority ?? true,
  };
}

export function Dialog() {
  const queryClient = useQueryClient();
  const [colorMode, setColorMode] = useColorMode();
  const [showContentErrors, setShowContentErrors] = useState(false);
  const [previewLocale, setPreviewLocale] = useState<LocaleCode>('en');

  const { data: settings, isLoading: settingsLoading } = useSettings();
  const savedContent = settings?.widgetDialogContent ?? DEFAULT_DIALOG_CONTENT;
  const contentDraft = useDraft<GlobalWidgetDialogContentSettings>(savedContent);
  const displayContent = contentDraft.value ?? savedContent;
  const contentMutation = useUpdateSettings({
    successMessage: 'Dialog settings saved',
    errorMessage: 'Failed to save dialog settings',
  });

  const { data: config, isLoading } = useQuery({
    queryKey: ['branding-config'],
    queryFn: brandingApi.getConfig,
  });
  const colorsDraft = useDraft<ThemeColors>(config?.widgetPrimaryColors);
  const displayColors: ThemeColors = colorsDraft.value ?? DEFAULT_WIDGET_COLORS;

  const mutation = useMutation({
    mutationFn: brandingApi.updateWidgetPrimaryColors,
    onSuccess: (_data, changes) => {
      queryClient.setQueryData<BrandingConfig>(['branding-config'], (current) =>
        current
          ? { ...current, widgetPrimaryColors: { ...current.widgetPrimaryColors, ...changes } }
          : current
      );
      queryClient.invalidateQueries({ queryKey: ['branding-config'] });
      colorsDraft.reset();
      toast.success('Widget dialog colors updated');
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, 'Failed to update widget dialog colors'));
    },
  });

  const handleColorsChange = (next: Partial<ThemeColors>) => {
    colorsDraft.patch(changedFields(next, displayColors, { skipUndefined: true }));
  };

  const handleColorsReset = () => {
    const modeDefaults: Partial<ThemeColors> = Object.fromEntries(
      Object.entries(DEFAULT_WIDGET_COLORS).filter(([key]) => key.startsWith(colorMode))
    );
    handleColorsChange(modeDefaults);
  };

  const handleContentChange = (next: WidgetDialogContentSettings) => {
    contentDraft.patch(
      changedFields(toGlobalContent(next), displayContent, { skipUndefined: true })
    );
  };

  const contentErrors = dialogContentErrors(displayContent);

  const saveContent = async () => {
    if (Object.keys(contentErrors).length > 0) {
      setShowContentErrors(true);
      return false;
    }
    await contentMutation.mutateAsync({ widgetDialogContent: contentDraft.changes });
    contentDraft.reset();
    setShowContentErrors(false);
    return true;
  };

  const discardContent = () => {
    contentDraft.reset();
    setShowContentErrors(false);
  };

  // Wait for config to fully load before rendering the form
  if (isLoading || settingsLoading || !config?.widgetPrimaryColors) {
    return (
      <SectionCard section="dialog" showHeader={false}>
        <SectionLoading />
      </SectionCard>
    );
  }

  return (
    <Tabs defaultValue="general" className="space-y-6">
      {/* Both tabs stay mounted so unsaved edits survive switching tabs. */}
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="colors">Colors</TabsTrigger>
      </TabsList>
      <SettingsWithPreview
        placement="side-wide"
        preview={
          <DialogPreviewCard
            colors={resolveDialogColors(displayColors)}
            mode={colorMode}
            content={resolveDialogContentPreview(displayContent, undefined, previewLocale)}
          />
        }
      >
        <TabsContent value="general" forceMount className="mt-0">
          <SectionCard section="dialog" showHeader={false}>
            <UnsavedChangesGuard
              isDirty={contentDraft.isDirty}
              onSave={saveContent}
              onDiscard={discardContent}
            />
            <div className="space-y-6">
              <WidgetDialogContentForm
                value={displayContent}
                onChange={handleContentChange}
                disabled={contentMutation.isPending}
                errors={showContentErrors ? contentErrors : undefined}
                onPreviewLocaleChange={setPreviewLocale}
              />
              <ResetToDefaultButton
                onReset={() => handleContentChange(DEFAULT_DIALOG_CONTENT)}
                disabled={contentMutation.isPending}
              />
            </div>
          </SectionCard>
        </TabsContent>
        <TabsContent value="colors" forceMount className="mt-0">
          <SectionCard section="dialog" showHeader={false}>
            <UnsavedChangesGuard
              isDirty={colorsDraft.isDirty}
              onSave={() => mutation.mutateAsync(colorsDraft.changes)}
              onDiscard={colorsDraft.reset}
            />
            <div className="space-y-6">
              <WidgetDialogSettingsForm
                value={displayColors}
                onChange={handleColorsChange}
                disabled={mutation.isPending}
                colorMode={colorMode}
                onColorModeChange={setColorMode}
              />
              <ResetToDefaultButton
                onReset={handleColorsReset}
                disabled={mutation.isPending}
                label={colorMode === 'dark' ? 'Reset to Dark Default' : 'Reset to Light Default'}
              />
            </div>
          </SectionCard>
        </TabsContent>
      </SettingsWithPreview>
    </Tabs>
  );
}
