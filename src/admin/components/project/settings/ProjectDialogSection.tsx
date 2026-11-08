import type { AppSettings, LocaleCode, ThemeColors } from '@shared/types';
import type { ColorMode } from '../../ThemeColorPicker';
import { SectionCard } from '../../settings/SectionCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import {
  WidgetDialogContentForm,
  dialogContentErrors,
  resolveDialogContentPreview,
} from '../../WidgetDialogContentForm';
import { WidgetDialogSettingsForm, resolveDialogColors } from '../../WidgetDialogSettingsForm';
import { DialogPreviewCard, SettingsWithPreview } from '../../widget/WidgetSettingsLayout';
import { CustomSwitch, InheritedBadge, InheritedFields } from './ProjectSettingsControls';
import type { ProjectSettingsForm, UpdateProjectSettingsForm } from './projectSettingsForm';

export function ProjectDialogSection({
  form,
  update,
  globalSettings,
  globalWidgetColors,
  showContentErrors,
  onHideContentErrors,
  previewLocale,
  onPreviewLocaleChange,
  colorMode,
  onColorModeChange,
}: {
  form: ProjectSettingsForm;
  update: UpdateProjectSettingsForm;
  globalSettings: AppSettings | undefined;
  globalWidgetColors: ThemeColors | undefined;
  showContentErrors: boolean;
  onHideContentErrors: () => void;
  previewLocale: LocaleCode;
  onPreviewLocaleChange: (locale: LocaleCode) => void;
  colorMode: ColorMode;
  onColorModeChange: (mode: ColorMode) => void;
}) {
  const {
    useCustomWidgetDialog,
    widgetDialogSettings,
    useCustomDialogContent,
    dialogContentSettings,
  } = form;
  const globalDialogContent = globalSettings?.widgetDialogContent;

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
            colors={resolveDialogColors(widgetDialogSettings, globalWidgetColors)}
            mode={colorMode}
            content={resolveDialogContentPreview(
              dialogContentSettings,
              globalDialogContent,
              previewLocale
            )}
          />
        }
      >
        <TabsContent value="general" forceMount className="mt-0">
          <SectionCard
            section="dialogContent"
            badge={!useCustomDialogContent && <InheritedBadge />}
            action={
              <CustomSwitch
                id="use-custom-dialog-content"
                label="Use custom dialog texts and fields"
                checked={useCustomDialogContent}
                onCheckedChange={(checked) => {
                  if (checked) {
                    update({ useCustomDialogContent: true });
                  } else {
                    update({ useCustomDialogContent: false, dialogContentSettings: {} });
                    onHideContentErrors();
                  }
                }}
              />
            }
          >
            <InheritedFields
              custom={useCustomDialogContent}
              defaultsPath="/settings/project-defaults/dialog"
            >
              <WidgetDialogContentForm
                value={dialogContentSettings}
                onChange={(next) => update({ dialogContentSettings: next })}
                globalContent={globalDialogContent}
                disabled={!useCustomDialogContent}
                errors={showContentErrors ? dialogContentErrors(dialogContentSettings) : undefined}
                onPreviewLocaleChange={onPreviewLocaleChange}
              />
            </InheritedFields>
          </SectionCard>
        </TabsContent>
        <TabsContent value="colors" forceMount className="mt-0">
          <SectionCard
            section="dialog"
            badge={!useCustomWidgetDialog && <InheritedBadge />}
            action={
              <CustomSwitch
                id="use-custom-widget-dialog"
                label="Use custom dialog colors"
                checked={useCustomWidgetDialog}
                onCheckedChange={(checked) =>
                  update(
                    checked
                      ? { useCustomWidgetDialog: true }
                      : { useCustomWidgetDialog: false, widgetDialogSettings: {} }
                  )
                }
              />
            }
          >
            <InheritedFields
              custom={useCustomWidgetDialog}
              defaultsPath="/settings/project-defaults/dialog"
            >
              <WidgetDialogSettingsForm
                value={widgetDialogSettings}
                onChange={(next) => update({ widgetDialogSettings: next })}
                globalWidgetColors={globalWidgetColors}
                disabled={!useCustomWidgetDialog}
                colorMode={colorMode}
                onColorModeChange={onColorModeChange}
              />
            </InheritedFields>
          </SectionCard>
        </TabsContent>
      </SettingsWithPreview>
    </Tabs>
  );
}
