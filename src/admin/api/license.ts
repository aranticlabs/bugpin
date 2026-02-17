import axios from 'axios';

export interface LicenseStatus {
  eeAvailable: boolean;
  licensed: boolean;
  message?: string;
  plan?: string;
  customerName?: string;
  features?: string[];
  expiresAt?: string;
}

export interface FeatureStatus {
  eeAvailable: boolean;
  features: Record<string, boolean>;
}

export const licenseApi = {
  /**
   * Get overall license status
   */
  async getStatus(): Promise<LicenseStatus> {
    const response = await axios.get<LicenseStatus>('/api/license/status');
    return response.data;
  },

  /**
   * Get all feature availability
   */
  async getFeatures(): Promise<FeatureStatus> {
    const response = await axios.get<FeatureStatus>('/api/license/features');
    return response.data;
  },

  /**
   * Check if a specific feature is available
   */
  async hasFeature(feature: string): Promise<boolean> {
    const response = await axios.get<{ available: boolean }>(`/api/license/feature/${feature}`);
    return response.data.available;
  },

  /**
   * Activate a license key
   */
  async activate(licenseKey: string): Promise<void> {
    await axios.post('/api/license/activate', { licenseKey });
  },

  /**
   * Remove the current license
   */
  async remove(): Promise<void> {
    await axios.delete('/api/license');
  },
};
