import { Link, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Crown } from 'lucide-react';
import { licenseApi } from '../api/license';
import { useAuth } from '../contexts/AuthContext';
import { badgeVariants } from './ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { SidebarProvider, SidebarInset, SidebarTrigger } from './ui/sidebar';
import { Separator } from './ui/separator';
import { ScrollArea } from './ui/scroll-area';
import { AppSidebar } from './sidebar/AppSidebar';
import { Footer } from './Footer';
import { findSettingsNavItem } from '../lib/settingsNavigation';
import { UpdateBanner } from './UpdateBanner';
import { usePreference } from '../hooks/useUserPreferences';
import { ThemePreferenceSync } from './ThemePreferenceSync';
import { SIDEBAR_WIDTH_DEFAULT, SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN } from '@shared/types';
import { UnsavedChangesBar, UnsavedChangesBarSpacer } from './UnsavedChangesGuard';

export function Layout() {
  const { user, canLoadData } = useAuth();
  const [sidebarWidth, setSidebarWidth] = usePreference('sidebarWidth', SIDEBAR_WIDTH_DEFAULT, {
    cache: true,
  });
  const [sidebarOpen, setSidebarOpen] = usePreference('sidebarOpen', true, { cache: true });
  const { data: license, isError: licenseError } = useQuery({
    queryKey: ['license-status'],
    queryFn: licenseApi.getStatus,
    enabled: canLoadData,
    refetchInterval: 60_000,
  });
  const enterpriseBadgeClass = badgeVariants({
    variant: 'outline',
    className: 'border-0 gap-1.5 px-2 py-1.5 text-muted-foreground sm:px-3',
  });
  const enterpriseLabel = (
    <>
      <Crown className="size-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">Enterprise</span>
    </>
  );
  const location = useLocation();
  const settingsMatch = findSettingsNavItem(location.pathname);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Dashboard';
    if (path.startsWith('/reports')) return 'Reports';
    if (path.startsWith('/projects')) return 'Projects';
    return 'BugPin';
  };

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      width={sidebarWidth}
      minWidth={SIDEBAR_WIDTH_MIN}
      maxWidth={SIDEBAR_WIDTH_MAX}
      onWidthChange={setSidebarWidth}
    >
      <ThemePreferenceSync />
      <AppSidebar />
      <SidebarInset className="flex flex-col h-screen max-w-[100vw] min-w-0">
        <UpdateBanner />
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />

          {settingsMatch ? (
            <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
              <span className="text-muted-foreground">Settings</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-muted-foreground">{settingsMatch.group.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {location.pathname === settingsMatch.item.path ? (
                <h1 className="font-medium">{settingsMatch.item.title}</h1>
              ) : (
                <>
                  <Link
                    to={settingsMatch.item.path}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {settingsMatch.item.title}
                  </Link>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <h1 className="font-medium">Details</h1>
                </>
              )}
            </nav>
          ) : (
            <h1 className="text-sm font-medium">{getPageTitle()}</h1>
          )}
          {user && license?.licensed && !licenseError && (
            <div className="ml-auto shrink-0">
              <Tooltip delayDuration={500}>
                <TooltipTrigger asChild>
                  {user.role === 'admin' ? (
                    <Link
                      to="/settings/license"
                      className={enterpriseBadgeClass}
                      aria-label="Enterprise license active"
                    >
                      {enterpriseLabel}
                    </Link>
                  ) : (
                    <span
                      className={enterpriseBadgeClass}
                      aria-label="Enterprise license active"
                      tabIndex={0}
                    >
                      {enterpriseLabel}
                    </span>
                  )}
                </TooltipTrigger>
                <TooltipContent>Enterprise license active</TooltipContent>
              </Tooltip>
            </div>
          )}
        </header>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <ScrollArea className="flex-1" aria-label="Page content">
            <div className="flex flex-col gap-4 p-4 md:p-6">
              <Outlet />
              <UnsavedChangesBarSpacer />
            </div>
          </ScrollArea>
          <UnsavedChangesBar />
        </div>
        <Footer />
      </SidebarInset>
    </SidebarProvider>
  );
}
