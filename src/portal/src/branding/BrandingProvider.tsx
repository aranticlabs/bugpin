import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { applyButtonColors } from '@shared-ui/theme/button-colors';
import { portalFetch } from '../api/client';
import type { AdminButtonColors } from '@shared/types';
import type { Locale } from '../i18n/catalog';

interface PortalConfig {
  appName: string;
  branding: {
    buttonColors: AdminButtonColors;
    logoLightUrl: string | null;
    logoDarkUrl: string | null;
    faviconLightVersion: string;
    faviconDarkVersion: string;
  };
  hideFooterBranding: boolean;
  locales: Locale[];
  teamSignIn: boolean;
}
const COLORS_STYLE_ID = 'bugpin-portal-colors';
const BrandingContext = createContext<PortalConfig | undefined>(undefined);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ['portal', 'config'],
    queryFn: async () => (await portalFetch<{ config: PortalConfig }>('/config')).config,
    staleTime: 30000,
  });
  useEffect(() => {
    if (!data) return;
    if (data.branding.buttonColors) applyButtonColors(COLORS_STYLE_ID, data.branding.buttonColors);
    for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')) {
      if (!link.href) continue;
      let url: URL;
      try {
        url = new URL(link.href);
      } catch {
        continue;
      }
      if (url.origin !== location.origin || !url.pathname.startsWith('/branding/')) continue;
      url.searchParams.set(
        'v',
        url.pathname.includes('/dark/')
          ? data.branding.faviconDarkVersion
          : data.branding.faviconLightVersion
      );
      link.href = url.href;
    }
  }, [data]);
  return <BrandingContext.Provider value={data}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
