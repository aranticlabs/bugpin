import { useMutation } from '@tanstack/react-query';
import { Card, CardContent } from '@shared-ui/components/ui/card';
import { Label } from '@shared-ui/components/ui/label';
import { Switch } from '@shared-ui/components/ui/switch';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n/I18nProvider';

/** The reporter's global email update preference, which applies to all their reports */
export function NotificationsCard() {
  const { t } = useI18n();
  const auth = useAuth();
  const update = useMutation({ mutationFn: auth.updateProfile });
  if (!auth.reporter) return null;
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="email-notifications">{t('notifications')}</Label>
            <p id="email-notifications-hint" className="text-xs text-muted-foreground">
              {t('notificationsHint')}
            </p>
          </div>
          <Switch
            id="email-notifications"
            aria-describedby="email-notifications-hint"
            checked={auth.reporter.emailUpdates}
            disabled={update.isPending}
            onCheckedChange={(emailUpdates) => update.mutate({ emailUpdates })}
          />
        </div>
        {update.isError && (
          <p role="alert" className="text-sm text-destructive">
            {t('requestFailed')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
