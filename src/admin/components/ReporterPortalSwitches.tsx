import type { ReporterPortalProjectSettings } from '@shared/types';
import { Label } from './ui/label';
import { Switch } from './ui/switch';

/**
 * The two Reporter Portal switches shared by the project defaults and the project settings.
 * Turning a switch on needs the portal prerequisites; turning it off is always possible.
 */
export function ReporterPortalSwitches({
  value,
  onChange,
  ready,
  disabled = false,
  scope,
}: {
  value: ReporterPortalProjectSettings;
  onChange: (next: ReporterPortalProjectSettings) => void;
  ready: boolean;
  disabled?: boolean;
  scope: 'project' | 'defaults';
}) {
  return (
    <div className="min-w-0 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="enable-reporter-portal">Let reporters see their reports</Label>
          <p className="text-sm text-muted-foreground">
            {scope === 'project'
              ? 'Reporters can access their owned reports in this project.'
              : 'Reporters can access their owned reports in every project that uses these defaults.'}
          </p>
        </div>
        <Switch
          id="enable-reporter-portal"
          checked={value.enabled}
          disabled={(!ready && !value.enabled) || disabled}
          onCheckedChange={(enabled) =>
            onChange({ enabled, allowNewReports: enabled && value.allowNewReports })
          }
        />
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="allow-portal-reports">Allow new reports from the portal</Label>
          <p className="text-sm text-muted-foreground">
            {scope === 'project'
              ? 'Reporters who already own a report in this project can submit new reports through the portal.'
              : 'Reporters who already own a report in a project can submit new reports to it through the portal.'}
          </p>
        </div>
        <Switch
          id="allow-portal-reports"
          checked={value.allowNewReports}
          disabled={((!value.enabled || !ready) && !value.allowNewReports) || disabled}
          onCheckedChange={(allowNewReports) => onChange({ ...value, allowNewReports })}
        />
      </div>
    </div>
  );
}
