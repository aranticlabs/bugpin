import type { AppSettings, LocaleCode } from '@shared/types';
import type { ColorMode } from '../../ThemeColorPicker';
import { SectionCard } from '../../settings/SectionCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { WidgetLauncherButtonSettingsForm } from '../../WidgetLauncherButtonSettingsForm';
import { LauncherPreviewCard, SettingsWithPreview } from '../../widget/WidgetSettingsLayout';
import { CustomSwitch, InheritedBadge, InheritedFields } from './ProjectSettingsControls';
import type { ProjectSettingsForm, UpdateProjectSettingsForm } from './projectSettingsForm';

export function ProjectLauncherSection({
  form,
  update,
  globalSettings,
  previewLocale,
  onPreviewLocaleChange,
  colorMode,
  onColorModeChange,
}: {
  form: ProjectSettingsForm;
  update: UpdateProjectSettingsForm;
  globalSettings: AppSettings | undefined;
  previewLocale: LocaleCode;
  onPreviewLocaleChange: (locale: LocaleCode) => void;
  colorMode: ColorMode;
  onColorModeChange: (mode: ColorMode) => void;
}) {
  const { useCustomButton, buttonSettings } = form;

  return (
    <Tabs defaultValue="general" className="space-y-6">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="colors">Colors</TabsTrigger>
      </TabsList>
      <SettingsWithPreview
        preview={
          <LauncherPreviewCard
            launcher={buttonSettings}
            launcherGlobals={globalSettings}
            locale={previewLocale}
            mode={colorMode}
          />
        }
      >
        {(['general', 'colors'] as const).map((part) => (
          <TabsContent key={part} value={part} className="mt-0">
            <SectionCard
              section={part === 'general' ? 'launcher' : 'launcherColors'}
              badge={!useCustomButton && <InheritedBadge />}
              action={
                <CustomSwitch
                  id="use-custom-settings"
                  label="Use custom launcher button settings"
                  checked={useCustomButton}
                  onCheckedChange={(checked) =>
                    update(
                      checked
                        ? { useCustomButton: true }
                        : { useCustomButton: false, buttonSettings: {} }
                    )
                  }
                />
              }
            >
              <InheritedFields
                custom={useCustomButton}
                defaultsPath="/settings/project-defaults/launcher-button"
              >
                <WidgetLauncherButtonSettingsForm
                  part={part}
                  value={buttonSettings}
                  onChange={(next) => update({ buttonSettings: next })}
                  globalSettings={globalSettings}
                  onPreviewLocaleChange={onPreviewLocaleChange}
                  disabled={!useCustomButton}
                  colorMode={colorMode}
                  onColorModeChange={onColorModeChange}
                />
              </InheritedFields>
            </SectionCard>
          </TabsContent>
        ))}
      </SettingsWithPreview>
    </Tabs>
  );
}
