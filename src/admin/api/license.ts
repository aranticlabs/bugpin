import axios from 'axios';

export interface LicenseStatus {
  eeAvailable: boolean;
  licensed: boolean;
  installed?: boolean;
  message?: string;
  /** Set when an installed license is not valid. */
  reason?: 'expired' | 'inactive' | 'verification_required';
  warning?: string;
  plan?: string;
  customerName?: string;
  customerEmail?: string;
  features?: string[];
  issuedAt?: string;
  expiresAt?: string;
  projectLimit?: number | null;
  usedProjects?: number;
  licensedProjectIds?: string[];
  selectionRequired?: boolean;
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
  async activate(
    licenseKey: string,
    projectIds: string[] | undefined,
    agreement: { accepted: true; version: string }
  ): Promise<void> {
    await axios.post('/api/license/activate', { licenseKey, projectIds, agreement });
  },

  /**
   * Sync the installed license with the license server
   */
  async sync(): Promise<LicenseStatus> {
    const response = await axios.post<LicenseStatus>('/api/license/sync');
    return response.data;
  },

  async selectProjects(projectIds: string[]): Promise<void> {
    await axios.put('/api/license/projects', { projectIds });
  },

  async remove(): Promise<void> {
    await axios.delete('/api/license');
  },
};
