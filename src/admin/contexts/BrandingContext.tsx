import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { brandingApi, type BrandingConfig } from '../api/branding';

interface BrandingContextType {
  config: BrandingConfig | undefined;
  isLoading: boolean;
  refetch: () => void;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

/**
 * Convert hex color to HSL string for CSS variables
 */
function hexToHsl(hex: string): string {
  // Remove # if present
  hex = hex.replace(/^#/, '');

  // Parse hex values
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  // Return HSL values formatted for CSS (with hsl() wrapper)
  return `hsl(${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

/**
 * Apply admin button/primary colors to CSS custom properties
 */
function applyAdminThemeColors(config: BrandingConfig, isDark: boolean) {
  const root = document.documentElement;
  const themeColors = config.adminThemeColors;

  if (!themeColors) return;

  if (isDark) {
    // Dark mode: use dark colors for primary buttons
    root.style.setProperty('--primary', hexToHsl(themeColors.darkButtonColor));
    root.style.setProperty('--primary-foreground', hexToHsl(themeColors.darkTextColor));
    root.style.setProperty('--primary-hover', hexToHsl(themeColors.darkButtonHoverColor));
    root.style.setProperty('--primary-hover-foreground', hexToHsl(themeColors.darkTextHoverColor));
  } else {
    // Light mode: use light colors for primary buttons
    root.style.setProperty('--primary', hexToHsl(themeColors.lightButtonColor));
    root.style.setProperty('--primary-foreground', hexToHsl(themeColors.lightTextColor));
    root.style.setProperty('--primary-hover', hexToHsl(themeColors.lightButtonHoverColor));
    root.style.setProperty('--primary-hover-foreground', hexToHsl(themeColors.lightTextHoverColor));
  }
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['branding-config'],
    queryFn: brandingApi.getConfig,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Apply admin colors when config changes or theme changes
  useEffect(() => {
    if (!config) return;

    // Check current theme
    const isDark = document.documentElement.classList.contains('dark');

    // Apply theme colors (buttons)
    if (config.adminThemeColors) {
      applyAdminThemeColors(config, isDark);
    }

    // Watch for theme changes
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class') {
          const isDarkNow = document.documentElement.classList.contains('dark');
          if (config.adminThemeColors) {
            applyAdminThemeColors(config, isDarkNow);
          }
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => observer.disconnect();
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
