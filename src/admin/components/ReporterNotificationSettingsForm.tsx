import { cn } from '../lib/utils';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import type { ReporterNotificationSettings } from '@shared/types';

interface ReporterNotificationSettingsFormProps {
  value: Partial<ReporterNotificationSettings>;
  onChange: (value: Partial<ReporterNotificationSettings>) => void;
  globalSettings?: {
    reporterNotifications?: ReporterNotificationSettings;
  };
  disabled?: boolean;
}

export function ReporterNotificationSettingsForm({
  value,
  onChange,
  globalSettings,
  disabled = false,
}: ReporterNotificationSettingsFormProps) {
  const effectiveEmailEnabled =
    value.emailEnabled ?? globalSettings?.reporterNotifications?.emailEnabled ?? true;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="reporter-email-enabled" className="text-sm font-normal">
            Email Notifications
          </Label>
          <p className="text-xs text-muted-foreground">Enable email notifications for reporters</p>
        </div>
        <Switch
          id="reporter-email-enabled"
          checked={effectiveEmailEnabled}
          onCheckedChange={(checked) => onChange({ ...value, emailEnabled: checked })}
          disabled={disabled}
        />
      </div>
      <div
        aria-disabled={!effectiveEmailEnabled || undefined}
        inert={!effectiveEmailEnabled}
        className={cn('space-y-4', !effectiveEmailEnabled && 'section-disabled')}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="reporter-new-report" className="text-sm font-normal">
              New Reports
            </Label>
            <p className="text-xs text-muted-foreground">
              Send confirmation email when a report is submitted
            </p>
          </div>
          <Switch
            id="reporter-new-report"
            checked={
              value.notifyOnNewReport ??
              globalSettings?.reporterNotifications?.notifyOnNewReport ??
              true
            }
            onCheckedChange={(checked) => onChange({ ...value, notifyOnNewReport: checked })}
            disabled={disabled}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="reporter-status-change" className="text-sm font-normal">
              Status Changes
            </Label>
            <p className="text-xs text-muted-foreground">Notify reporters on status changes</p>
          </div>
          <Switch
            id="reporter-status-change"
            checked={
              value.notifyOnStatusChange ??
              globalSettings?.reporterNotifications?.notifyOnStatusChange ??
              true
            }
            onCheckedChange={(checked) => onChange({ ...value, notifyOnStatusChange: checked })}
            disabled={disabled}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="reporter-priority-change" className="text-sm font-normal">
              Priority Changes
            </Label>
            <p className="text-xs text-muted-foreground">Notify reporters on priority changes</p>
          </div>
          <Switch
            id="reporter-priority-change"
            checked={
              value.notifyOnPriorityChange ??
              globalSettings?.reporterNotifications?.notifyOnPriorityChange ??
              true
            }
            onCheckedChange={(checked) => onChange({ ...value, notifyOnPriorityChange: checked })}
            disabled={disabled}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="reporter-assignment-change" className="text-sm font-normal">
              Assignment Changes
            </Label>
            <p className="text-xs text-muted-foreground">
              Notify reporters when a report is assigned or reassigned
            </p>
          </div>
          <Switch
            id="reporter-assignment-change"
            checked={
              value.notifyOnAssignment ??
              globalSettings?.reporterNotifications?.notifyOnAssignment ??
              true
            }
            onCheckedChange={(checked) => onChange({ ...value, notifyOnAssignment: checked })}
            disabled={disabled}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="reporter-messaging" className="text-sm font-normal">
              Messaging System
            </Label>
            <p className="text-xs text-muted-foreground">Allow sending messages to reporters</p>
          </div>
          <Switch
            id="reporter-messaging"
            checked={
              value.messagingEnabled ??
              globalSettings?.reporterNotifications?.messagingEnabled ??
              true
            }
            onCheckedChange={(checked) => onChange({ ...value, messagingEnabled: checked })}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
