import type { FileType, MessageAuthorKind, ReportStatus } from './types';

export interface PortalProject {
  id: string;
  name: string;
  allowNewFeedback: boolean;
  maxImageMb: number;
  maxVideoMb: number;
}

export interface PortalReportSummary {
  id: string;
  title: string;
  status: ReportStatus;
  project: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  unread: boolean;
}

export interface PortalReportPage {
  reports: PortalReportSummary[];
  nextCursor: string | null;
  total: number;
}

export type PortalReportList = PortalReportPage & { unreadCount: number };

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
  body: string;
  files: PortalFile[];
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
  canReply: boolean;
  canSubmitNewFeedback: boolean;
}

export interface PortalMe {
  id: string;
  email: string;
  displayName: string;
  locale: string;
  emailUpdates: boolean;
}
