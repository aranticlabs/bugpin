export interface ReportOwner {
  reporterId: string | null;
  claimableEmail: string | null;
  correspondentEmail: string | null;
  reporter: { id: string; email: string; displayName: string; lastLoginAt: string | null } | null;
}

export interface ReporterSummary {
  id: string;
  email: string;
  displayName: string;
  projects: Array<{ id: string; name: string }>;
  ownedReportCount: number;
  lastLoginAt: string | null;
  status: 'active' | 'suspended';
}

export interface StaffConversationPortal {
  visible: boolean;
  ownerEmail: string | null;
  correspondentEmail: string | null;
  ownerLastLoginAt: string | null;
  emailSuppressed: boolean;
  requiresPortalAccessConfirmation: boolean;
}
