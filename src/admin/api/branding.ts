import { api } from './client';
import type { ThemeColors } from '@shared/types';

export interface BrandingConfig {
  primaryColor: string;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  iconLightUrl: string | null;
  iconDarkUrl: string | null;
  faviconLightVersion: string;
  faviconDarkVersion: string;
  // Admin Console button colors
  adminThemeColors: ThemeColors;
  // Widget primary theme colors (for modal/popup UI)
  widgetPrimaryColors: ThemeColors;
}

export const brandingApi = {
  /**
   * Get branding configuration
   */
  getConfig: async (): Promise<BrandingConfig> => {
    const response = await api.get('/branding/config');
    return response.data.config;
  },

  /**
   * Upload logo (light or dark mode)
   */
  uploadLogo: async (mode: 'light' | 'dark', file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post(`/branding/logo/${mode}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data.url;
  },

  /**
   * Upload favicon (light or dark mode)
   */
  uploadFavicon: async (mode: 'light' | 'dark', file: File): Promise<void> => {
    const formData = new FormData();
    formData.append('file', file);

    await api.post(`/branding/favicon/${mode}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  /**
   * Update primary color
   */
  updatePrimaryColor: async (color: string): Promise<void> => {
    await api.put('/branding/primary-color', { color });
  },

  /**
   * Update admin portal button colors
   */
  updateAdminThemeColors: async (colors: Partial<ThemeColors>): Promise<void> => {
    await api.put('/branding/admin-theme-colors', colors);
  },

  /**
   * Update widget primary theme colors
   */
  updateWidgetPrimaryColors: async (colors: Partial<ThemeColors>): Promise<void> => {
    await api.put('/branding/widget-primary-colors', colors);
  },

  /**
   * Reset logo to default
   */
  resetLogo: async (mode: 'light' | 'dark'): Promise<void> => {
    await api.delete(`/branding/logo/${mode}`);
  },

  /**
   * Upload icon (light or dark mode) - 1:1 aspect ratio
   */
  uploadIcon: async (mode: 'light' | 'dark', file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post(`/branding/icon/${mode}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data.url;
  },

  /**
   * Reset icon to default
   */
  resetIcon: async (mode: 'light' | 'dark'): Promise<void> => {
    await api.delete(`/branding/icon/${mode}`);
  },

  /**
   * Reset favicon to default
   */
  resetFavicon: async (mode: 'light' | 'dark'): Promise<void> => {
    await api.delete(`/branding/favicon/${mode}`);
  },

  /**
   * Reset all branding to defaults
   */
  resetAll: async (): Promise<void> => {
    await api.post('/branding/reset');
  },
};
