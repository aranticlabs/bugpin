import { Eye } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

export function TeamStrip() {
  const { t } = useI18n();
  return (
    <div role="status" className="border-b bg-primary text-primary-foreground">
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-1.5 text-xs sm:px-6">
        <Eye className="size-3.5" aria-hidden />
        <span className="font-medium">{t('teamViewTitle')}</span>
        <span className="opacity-80">{t('teamViewText')}</span>
      </div>
    </div>
  );
}
