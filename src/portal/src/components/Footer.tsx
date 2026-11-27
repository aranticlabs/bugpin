import { useBranding } from '../branding/BrandingProvider';
import { useI18n } from '../i18n/I18nProvider';
import { RichText } from './RichText';

export function Footer() {
  const branding = useBranding();
  const { t } = useI18n();
  if (branding?.hideFooterBranding) return null;
  return (
    <footer className="border-t bg-background px-4 py-3 text-center">
      <span className="text-xs text-muted-foreground">
        <RichText
          template={t('poweredBy')}
          values={{
            name: (
              <a
                href="https://bugpin.io"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--bugpin-primary-700)] no-underline hover:text-[var(--bugpin-primary-800)] hover:underline dark:text-[var(--bugpin-primary-300)] dark:hover:text-[var(--bugpin-primary-200)]"
              >
                BugPin
              </a>
            ),
          }}
        />
      </span>
    </footer>
  );
}
