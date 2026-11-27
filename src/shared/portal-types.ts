import type { FileType, MessageAuthorKind, ReportStatus } from './types';

export type PortalEvent =
  | { type: 'report.updated' | 'message.created'; data: { reportId: string; projectId: string } }
  | { type: 'access.changed'; data: Record<string, never> };

export interface PortalProject {
  id: string;
  name: string;
  allowNewReports: boolean;
  maxImageMb: number;
  maxVideoMb: number;
}

export const PORTAL_REPORT_SORTS = ['updated', 'newest', 'oldest'] as const;
export type PortalReportSort = (typeof PORTAL_REPORT_SORTS)[number];

export interface PortalLatestReply {
  authorKind: MessageAuthorKind;
  authorName: string;
  isOwn: boolean;
  isPreviousReporter: boolean;
  /** The first 160 characters of the message */
  body: string;
  fileCount: number;
  createdAt: string;
}

export interface PortalReportSummary {
  id: string;
  title: string;
  status: ReportStatus;
  project: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  unread: boolean;
  replyCount: number;
  latestReply: PortalLatestReply | null;
}

export interface PortalReportPage {
  reports: PortalReportSummary[];
  nextCursor: string | null;
  total: number;
}

export type PortalReportList = PortalReportPage & {
  unreadCount: number;
  /** Reports per status for the current project and search filters, ignoring the status filter */
  statusCounts: Record<ReportStatus, number>;
};

export interface PortalReportBoard {
  columns: Record<ReportStatus, PortalReportPage>;
  unreadCount: number;
}

export interface PortalFile {
  id: string;
  type: FileType;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  url: string;
}

export interface PortalMessage {
  id: string;
  authorKind: MessageAuthorKind;
  authorName: string;
  isOwn: boolean;
  isPreviousReporter: boolean;
  body: string;
  files: PortalFile[];
  createdAt: string;
}

/** The technical context the widget captured with a report, limited to what a reporter may see */
export interface PortalReportEnvironment {
  /** The page address without its query string and fragment */
  pageUrl: string | null;
  browser: string | null;
  os: string | null;
  viewport: { width: number; height: number } | null;
  timezone: string | null;
}

export interface PortalStatusEvent {
  id: string;
  from: ReportStatus;
  to: ReportStatus;
  /** Null when the staff member no longer exists */
  actorName: string | null;
  createdAt: string;
}

export interface PortalReportDetail {
  id: string;
  title: string;
  description: string | null;
  status: ReportStatus;
  project: { id: string; name: string };
  assigneeName: string | null;
  createdAt: string;
  updatedAt: string;
  files: PortalFile[];
  messages: PortalMessage[];
  statusEvents: PortalStatusEvent[];
  /** Null for reports created in the portal, which capture no technical context */
  environment: PortalReportEnvironment | null;
  canReply: boolean;
  canSubmitNewReport: boolean;
}

export interface PortalMe {
  id: string;
  email: string;
  displayName: string;
  locale: string;
  emailUpdates: boolean;
}

export interface PortalOperator {
  id: string;
  email: string;
  name: string;
}

export type PortalTeamLoginResult =
  | { status: 'signedIn'; operator: PortalOperator }
  | {
      status: 'twoFactorRequired';
      challengeToken: string;
      methods: { totp: boolean; recoveryCode: true };
    }
  | { status: 'verificationSent'; maskedEmail: string };
