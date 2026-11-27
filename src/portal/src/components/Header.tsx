import { Link, useLocation } from 'react-router-dom';
import { Globe, Inbox, Plus } from 'lucide-react';
import { useTheme } from '@shared-ui/theme/ThemeProvider';
import { Badge } from '@shared-ui/components/ui/badge';
import { Button } from '@shared-ui/components/ui/button';
import { Separator } from '@shared-ui/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@shared-ui/components/ui/select';
import { useAuth } from '../auth/AuthProvider';
import { useBranding } from '../branding/BrandingProvider';
import { useI18n } from '../i18n/I18nProvider';
import { normalizeLocale } from '../i18n/catalog';
import { useProjects } from '../hooks/useProjects';
import { useUnreadCount } from '../hooks/useUnreadCount';
import { ProfileMenu, languages } from './ProfileMenu';
import { ThemeMenu } from './ThemeMenu';

function LanguageSelect() {
  const { locale, setLocale, t } = useI18n();
  return (
    <Select
      value={locale}
      onValueChange={(value) => {
        const next = normalizeLocale(value);
        if (next) setLocale(next);
      }}
    >
      <SelectTrigger
        aria-label={t('language')}
        className="w-auto gap-2 border-none bg-transparent shadow-none"
      >
        <Globe className="size-4 text-muted-foreground" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(languages).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function Header() {
  const auth = useAuth();
  const branding = useBranding();
  const { resolvedTheme } = useTheme();
  const { t } = useI18n();
  const location = useLocation();
  const projects = useProjects(Boolean(auth.reporter));
  const unread = useUnreadCount();
  const appName = branding?.appName ?? 'BugPin';
  const logo = branding?.branding;
  const canSubmit = Boolean(
    auth.reporter && projects.data?.some((project) => project.allowNewReports)
  );
  const onReports = location.pathname.startsWith('/reports');
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex min-h-16 w-full max-w-[1440px] items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="min-w-0 shrink" aria-label={appName}>
          <img
            src={
              resolvedTheme === 'dark'
                ? (logo?.logoDarkUrl ?? '/branding/dark/logo-dark.svg')
                : (logo?.logoLightUrl ?? '/branding/light/logo-light.svg')
            }
            alt={appName}
            className="h-8 max-w-full object-contain"
          />
        </Link>
        <Separator orientation="vertical" className="hidden h-6 sm:block" />
        <span className="hidden shrink-0 text-sm font-medium text-muted-foreground sm:inline">
          {t('portalTitle')}
        </span>
        {auth.signedIn && (
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            <Button asChild variant={onReports ? 'secondary' : 'ghost'} size="sm">
              <Link
                to="/reports"
                aria-current={location.pathname === '/reports' ? 'page' : undefined}
              >
                <Inbox />
                {t(auth.operator ? 'teamReports' : 'myReports')}
                {unread > 0 && (
                  <Badge size="sm" className="ml-1">
                    <span aria-hidden>{unread}</span>
                    <span className="sr-only">{t('unreadCount', { count: unread })}</span>
                  </Badge>
                )}
              </Link>
            </Button>
          </nav>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {canSubmit && (
            <Button asChild size="sm">
              <Link to="/new" aria-label={t('newReport')}>
                <Plus />
                <span className="hidden sm:inline">{t('newReport')}</span>
              </Link>
            </Button>
          )}
          {!auth.loading && !auth.signedIn && !location.pathname.startsWith('/team-login') && (
            <LanguageSelect />
          )}
          {!auth.loading && !auth.signedIn && <ThemeMenu />}
          {auth.signedIn && <ProfileMenu />}
        </div>
      </div>
    </header>
  );
}
