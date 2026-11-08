import type { AppSettings } from '@shared/types';
import { DiagnosticsSettingsForm, resolveDiagnosticSettings } from '../../DiagnosticsSettingsForm';
import { RecordingSettingsForm, resolveRecordingSettings } from '../../RecordingSettingsForm';
import { ScreenshotSettingsForm, resolveScreenshotSettings } from '../../ScreenshotSettingsForm';
import { SectionCard } from '../../settings/SectionCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { CustomSwitch, InheritedBadge, InheritedFields } from './ProjectSettingsControls';
import type { ProjectSettingsForm, UpdateProjectSettingsForm } from './projectSettingsForm';

const CAPTURE_DEFAULTS_PATH = '/settings/project-defaults/capture';

export function ProjectCaptureSection({
  form,
  update,
  globalSettings,
}: {
  form: ProjectSettingsForm;
  update: UpdateProjectSettingsForm;
  globalSettings: AppSettings | undefined;
}) {
  const {
    useCustomScreenshot,
    screenshotSettings,
    useCustomRecording,
    recordingSettings,
    useCustomDiagnostics,
    diagnosticSettings,
  } = form;

  return (
    <Tabs defaultValue="screenshot" className="space-y-6">
      <TabsList>
        <TabsTrigger value="screenshot">Screenshot</TabsTrigger>
        <TabsTrigger value="recording">Recording</TabsTrigger>
        <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
      </TabsList>
      <TabsContent value="screenshot" forceMount className="mt-0">
        <SectionCard
          section="screenshot"
          badge={!useCustomScreenshot && <InheritedBadge />}
          action={
            <CustomSwitch
              id="use-custom-screenshot"
              label="Use custom screenshot settings"
              checked={useCustomScreenshot}
              onCheckedChange={(checked) =>
                update({
                  useCustomScreenshot: checked,
                  // Turning custom settings on copies the inherited values, so the project keeps
                  // them even when nothing else is changed before saving.
                  screenshotSettings: checked
                    ? resolveScreenshotSettings(screenshotSettings, globalSettings)
                    : {},
                })
              }
            />
          }
        >
          <InheritedFields custom={useCustomScreenshot} defaultsPath={CAPTURE_DEFAULTS_PATH}>
            <ScreenshotSettingsForm
              value={screenshotSettings}
              onChange={(next) => update({ screenshotSettings: next })}
              globalSettings={globalSettings}
              disabled={!useCustomScreenshot}
            />
          </InheritedFields>
        </SectionCard>
      </TabsContent>
      <TabsContent value="recording" forceMount className="mt-0">
        <SectionCard
          section="recording"
          badge={!useCustomRecording && <InheritedBadge />}
          action={
            <CustomSwitch
              id="use-custom-recording"
              label="Use custom recording settings"
              checked={useCustomRecording}
              onCheckedChange={(checked) =>
                update({
                  useCustomRecording: checked,
                  recordingSettings: checked
                    ? resolveRecordingSettings(recordingSettings, globalSettings)
                    : {},
                })
              }
            />
          }
        >
          <InheritedFields custom={useCustomRecording} defaultsPath={CAPTURE_DEFAULTS_PATH}>
            <RecordingSettingsForm
              value={recordingSettings}
              onChange={(next) => update({ recordingSettings: next })}
              globalSettings={globalSettings}
              disabled={!useCustomRecording}
            />
          </InheritedFields>
        </SectionCard>
      </TabsContent>
      <TabsContent value="diagnostics" forceMount className="mt-0">
        <SectionCard
          section="diagnostics"
          badge={!useCustomDiagnostics && <InheritedBadge />}
          action={
            <CustomSwitch
              id="use-custom-diagnostics"
              label="Use custom diagnostics settings"
              checked={useCustomDiagnostics}
              onCheckedChange={(checked) =>
                update({
                  useCustomDiagnostics: checked,
                  diagnosticSettings: checked
                    ? resolveDiagnosticSettings(diagnosticSettings, globalSettings?.diagnostics)
                    : {},
                })
              }
            />
          }
        >
          <InheritedFields custom={useCustomDiagnostics} defaultsPath={CAPTURE_DEFAULTS_PATH}>
            <DiagnosticsSettingsForm
              value={diagnosticSettings}
              onChange={(next) => update({ diagnosticSettings: next })}
              defaults={globalSettings?.diagnostics}
              euPrivacyMode={globalSettings?.privacy?.euPrivacyMode}
              disabled={!useCustomDiagnostics}
            />
          </InheritedFields>
        </SectionCard>
      </TabsContent>
    </Tabs>
  );
}
