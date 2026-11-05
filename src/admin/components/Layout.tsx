import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
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
import { UpdateBanner } from './UpdateBanner';

interface RouteCrumbConfig {
  label: string;
  subTabs?: { hash: string; label: string }[];
  defaultHash?: string;
  showDefaultSubTab?: boolean;
}

const routeCrumbs: Record<string, RouteCrumbConfig> = {
  '/settings': {
    label: 'Settings',
    defaultHash: 'general',
    subTabs: [
      { hash: 'general', label: 'General' },
      { hash: 'storage', label: 'Storage' },
      { hash: 'smtp', label: 'SMTP' },
    ],
  },
  '/notifications': {
    label: 'Notifications',
    defaultHash: 'general',
    subTabs: [
      { hash: 'general', label: 'General' },
      { hash: 'reporter', label: 'Reporter' },
      { hash: 'email-templates', label: 'Email Templates' },
    ],
  },
  '/users': { label: 'Users' },
  '/security-privacy': {
    label: 'Security & Privacy',
    defaultHash: 'security',
    showDefaultSubTab: true,
    subTabs: [
      { hash: 'security', label: 'Security' },
      { hash: 'privacy', label: 'Privacy' },
    ],
  },
  '/branding': { label: 'Branding' },
  '/license': { label: 'License' },
  '/button': { label: 'Button' },
  '/dialog': { label: 'Dialog' },
  '/screenshot': { label: 'Screenshot' },
  '/recording': { label: 'Recording' },
  '/language': { label: 'Language' },
};

function findRouteConfig(pathname: string): { path: string; config: RouteCrumbConfig } | null {
  for (const [path, config] of Object.entries(routeCrumbs)) {
    if (pathname === path || pathname.startsWith(path + '/')) {
      return { path, config };
    }
  }
  return null;
}

export function Layout() {
  const { user, canLoadData } = useAuth();
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
  const navigate = useNavigate();
  const routeMatch = findRouteConfig(location.pathname);
  const [activeHash, setActiveHash] = useState<string>(window.location.hash.slice(1));

  useEffect(() => {
    const handler = () => setActiveHash(window.location.hash.slice(1));
    handler();
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Dashboard';
    if (path.startsWith('/reports')) return 'Reports';
    if (path.startsWith('/projects')) return 'Projects';
    return 'BugPin';
  };

  const renderBreadcrumb = () => {
    if (!routeMatch) return null;
    const { path, config } = routeMatch;
    const resolvedHash = activeHash || (config.showDefaultSubTab ? config.defaultHash : undefined);
    const activeSubTab = config.subTabs?.find((t) => t.hash === resolvedHash);
    const showSub =
      !!activeSubTab && (config.showDefaultSubTab || activeSubTab.hash !== config.defaultHash);

    return (
      <nav className="flex items-center gap-1 text-sm">
        {showSub ? (
          <>
            <button
              onClick={() => {
                navigate(path);
                history.replaceState(null, '', path);
                window.dispatchEvent(new HashChangeEvent('hashchange'));
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {config.label}
            </button>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{activeSubTab.label}</span>
          </>
        ) : (
          <span className="font-medium">{config.label}</span>
        )}
      </nav>
    );
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-screen max-w-[100vw] min-w-0">
        <UpdateBanner />
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />

          {routeMatch ? (
            renderBreadcrumb()
          ) : (
            <h1 className="text-sm font-medium">{getPageTitle()}</h1>
          )}
          {user && license?.licensed && !licenseError && (
            <div className="ml-auto shrink-0">
              <Tooltip delayDuration={500}>
                <TooltipTrigger asChild>
                  {user.role === 'admin' ? (
                    <Link
                      to="/license"
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
        <ScrollArea className="flex-1" aria-label="Page content">
          <div className="flex flex-col gap-4 p-4 md:p-6">
            <Outlet />
          </div>
        </ScrollArea>
        <Footer />
      </SidebarInset>
    </SidebarProvider>
  );
}
