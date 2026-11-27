import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { applyButtonColors } from '@shared-ui/theme/button-colors';
import { brandingApi, type BrandingConfig } from '../api/branding';

interface BrandingContextType {
  config: BrandingConfig | undefined;
  isLoading: boolean;
  refetch: () => void;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export const ADMIN_THEME_STYLE_ID = 'bugpin-admin-theme';

export function BrandingProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['branding-config'],
    queryFn: brandingApi.getConfig,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Apply admin colors when config changes or theme changes
  useEffect(() => {
    if (!config) return;

    for (const link of document.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]'
    )) {
      const url = new URL(link.href);
      if (url.origin !== location.origin || !url.pathname.startsWith('/branding/')) continue;
      const version = url.pathname.includes('/light/')
        ? config.faviconLightVersion
        : config.faviconDarkVersion;
      url.searchParams.set('v', version);
      if (link.href !== url.href) link.href = url.href;
    }

    if (config.adminThemeColors) {
      applyButtonColors(ADMIN_THEME_STYLE_ID, config.adminThemeColors);
    }
  }, [config]);

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['branding-config'] });
  };

  return (
    <BrandingContext.Provider value={{ config, isLoading, refetch }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): BrandingContextType {
  const context = useContext(BrandingContext);
  if (context === undefined) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }
  return context;
}
