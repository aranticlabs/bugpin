import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { portalFetch } from '../api/client';
import type { Locale } from '../i18n/catalog';

interface PortalConfig {
  appName: string;
  branding: {
    primaryColor: string;
    logoLightUrl: string | null;
    logoDarkUrl: string | null;
    faviconLightVersion: string;
    faviconDarkVersion: string;
  };
  hideFooterBranding: boolean;
  locales: Locale[];
}
const BrandingContext = createContext<PortalConfig | undefined>(undefined);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ['portal', 'config'],
    queryFn: async () => (await portalFetch<{ config: PortalConfig }>('/config')).config,
    staleTime: 30000,
  });
  useEffect(() => {
    if (!data) return;
    const { primaryColor } = data.branding;
    if (/^#[0-9a-f]{6}$/i.test(primaryColor)) {
      const channels = [1, 3, 5]
        .map((offset) => Number.parseInt(primaryColor.slice(offset, offset + 2), 16) / 255)
        .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
      const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      const foreground = luminance > 0.179 ? '#000000' : '#ffffff';
      document.documentElement.style.setProperty('--primary', primaryColor);
      document.documentElement.style.setProperty('--primary-hover', primaryColor);
      document.documentElement.style.setProperty('--primary-foreground', foreground);
      document.documentElement.style.setProperty('--primary-hover-foreground', foreground);
    }
    for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')) {
      const url = new URL(link.href);
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
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => document.documentElement.classList.toggle('dark', media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return <BrandingContext.Provider value={data}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
