import type { AppSettings } from '@shared/types';
import { DEFAULT_LANGUAGE_SETTINGS, LanguageSettingsForm } from '../../LanguageSettingsForm';
import { SectionCard } from '../../settings/SectionCard';
import { CustomSwitch, InheritedBadge, InheritedFields } from './ProjectSettingsControls';
import type { ProjectSettingsForm, UpdateProjectSettingsForm } from './projectSettingsForm';

export function ProjectLanguageSection({
  form,
  update,
  globalSettings,
}: {
  form: ProjectSettingsForm;
  update: UpdateProjectSettingsForm;
  globalSettings: AppSettings | undefined;
}) {
  const { useCustomLanguage, languageSettings } = form;
  const globalLanguage = globalSettings?.language ?? DEFAULT_LANGUAGE_SETTINGS;

  return (
    <SectionCard
      section="language"
      badge={!useCustomLanguage && <InheritedBadge />}
      action={
        <CustomSwitch
          id="use-custom-language"
          label="Use custom language settings"
          checked={useCustomLanguage}
          onCheckedChange={(checked) =>
            update(
              // A new override starts from the current global language.
              checked
                ? { useCustomLanguage: true, languageSettings: globalLanguage }
                : { useCustomLanguage: false }
            )
          }
        />
      }
    >
      <InheritedFields
        custom={useCustomLanguage}
        defaultsPath="/settings/project-defaults/language"
      >
        <LanguageSettingsForm
          value={useCustomLanguage ? languageSettings : globalLanguage}
          onChange={(next) => update({ languageSettings: next })}
          disabled={!useCustomLanguage}
        />
      </InheritedFields>
    </SectionCard>
  );
}
