import { useState } from 'react';
import type { LocaleCode } from '@shared/types';
import { Spinner } from '../ui/spinner';
import { UnsavedChangesGuard } from '../UnsavedChangesGuard';
import { useColorMode } from '../widget/WidgetSettingsLayout';
import { AutoSaveContext } from './settings/ProjectSettingsControls';
import { ProjectCaptureSection } from './settings/ProjectCaptureSection';
import { ProjectDialogSection } from './settings/ProjectDialogSection';
import { ProjectGeneralSection } from './settings/ProjectGeneralSection';
import { ProjectLanguageSection } from './settings/ProjectLanguageSection';
import { ProjectLauncherSection } from './settings/ProjectLauncherSection';
import { ProjectNotificationsSection } from './settings/ProjectNotificationsSection';
import { ProjectReporterPortalSection } from './settings/ProjectReporterPortalSection';
import { useProjectSettingsForm } from './settings/useProjectSettingsForm';

export type ProjectSettingsSection =
  'general' | 'launcher' | 'dialog' | 'language' | 'capture' | 'notifications' | 'reporter-portal';

interface ProjectSettingsPanelProps {
  projectId: string;
  section: ProjectSettingsSection;
}

export function ProjectSettingsPanel({ projectId, section }: ProjectSettingsPanelProps) {
  const settings = useProjectSettingsForm(projectId);
  const { form, update, globalSettings } = settings;
  const [previewLocale, setPreviewLocale] = useState<LocaleCode>('en');
  const [colorMode, setColorMode] = useColorMode();

  if (settings.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="text-primary" />
      </div>
    );
  }

  const hasPreview = section === 'launcher' || section === 'dialog';

  return (
    <AutoSaveContext.Provider value={settings.requestSave}>
      <UnsavedChangesGuard
        isDirty={settings.isDirty}
        onSave={settings.save}
        onDiscard={settings.discard}
      />
      <div className={hasPreview ? 'space-y-6' : 'max-w-4xl space-y-6'}>
        {section === 'general' && (
          <ProjectGeneralSection
            form={form}
            update={update}
            assignableUsers={settings.assignableUsers}
          />
        )}

        {section === 'launcher' && (
          <ProjectLauncherSection
            form={form}
            update={update}
            globalSettings={globalSettings}
            previewLocale={previewLocale}
            onPreviewLocaleChange={setPreviewLocale}
            colorMode={colorMode}
            onColorModeChange={setColorMode}
          />
        )}

        {section === 'dialog' && (
          <ProjectDialogSection
            form={form}
            update={update}
            globalSettings={globalSettings}
            globalWidgetColors={settings.brandingConfig?.widgetPrimaryColors}
            showContentErrors={settings.showDialogContentErrors}
            onHideContentErrors={settings.hideDialogContentErrors}
            previewLocale={previewLocale}
            onPreviewLocaleChange={setPreviewLocale}
            colorMode={colorMode}
            onColorModeChange={setColorMode}
          />
        )}

        {section === 'language' && (
          <ProjectLanguageSection form={form} update={update} globalSettings={globalSettings} />
        )}

        {section === 'capture' && (
          <ProjectCaptureSection form={form} update={update} globalSettings={globalSettings} />
        )}

        {section === 'notifications' && (
          <ProjectNotificationsSection
            form={form}
            update={update}
            globalSettings={globalSettings}
          />
        )}
        {section === 'reporter-portal' && (
          <ProjectReporterPortalSection
            projectId={projectId}
            form={form}
            update={update}
            project={settings.project}
            globalSettings={globalSettings}
          />
        )}
      </div>
    </AutoSaveContext.Provider>
  );
}
