import { Button } from '@shared-ui/components/ui/button';
import { useI18n } from '../i18n/I18nProvider';

export function QueryState({ loading, retry }: { loading?: boolean; retry?: () => void }) {
  const { t } = useI18n();
  return loading ? (
    <p role="status">{t('loading')}</p>
  ) : (
    <div role="alert" className="space-y-3">
      <p>{t('requestFailed')}</p>
      <Button variant="outline" onClick={retry}>
        {t('retry')}
      </Button>
    </div>
  );
}
