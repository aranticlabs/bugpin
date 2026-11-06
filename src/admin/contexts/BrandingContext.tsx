import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ThemeColors } from '@shared/types';
import { brandingApi, type BrandingConfig } from '../api/branding';

interface BrandingContextType {
  config: BrandingConfig | undefined;
  isLoading: boolean;
  refetch: () => void;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export const ADMIN_THEME_STYLE_ID = 'bugpin-admin-theme';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function declarations(colors: Record<string, string>): string {
  return Object.entries(colors)
    .filter(([, value]) => HEX_COLOR.test(value))
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ');
}

/**
 * Builds light and dark overrides for the primary tokens. The doubled selectors outrank the
 * defaults in globals.css regardless of stylesheet order, and the cascade handles theme switches.
 */
export function buildAdminThemeCss(themeColors: ThemeColors): string {
  const light = declarations({
    '--primary': themeColors.lightButtonColor,
    '--primary-foreground': themeColors.lightTextColor,
    '--primary-hover': themeColors.lightButtonHoverColor,
    '--primary-hover-foreground': themeColors.lightTextHoverColor,
  });
  const dark = declarations({
    '--primary': themeColors.darkButtonColor,
    '--primary-foreground': themeColors.darkTextColor,
    '--primary-hover': themeColors.darkButtonHoverColor,
    '--primary-hover-foreground': themeColors.darkTextHoverColor,
  });
  return `:root:root { ${light} } :root.dark { ${dark} }`;
}

function applyAdminThemeColors(themeColors: ThemeColors): void {
  let style = document.getElementById(ADMIN_THEME_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = ADMIN_THEME_STYLE_ID;
    document.head.append(style);
  }
  style.textContent = buildAdminThemeCss(themeColors);
}

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
      applyAdminThemeColors(config.adminThemeColors);
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
