import type { RecordingQuality } from './recording-quality';
import type { PasswordPolicy } from './password-policy';
import type { ReportOwner } from './reporter-types';

// Locale Types

export type LocaleCode = 'en' | 'de' | 'fr' | 'nl' | 'es' | 'it' | 'ja' | 'zh';

export const SUPPORTED_LOCALES: readonly LocaleCode[] = [
  'en',
  'de',
  'fr',
  'nl',
  'es',
  'it',
  'ja',
  'zh',
] as const;

export type LocalizedString = Partial<Record<LocaleCode, string>> & { en: string };

export interface LauncherTextBundle {
  project: LocalizedString | null | undefined;
  global: LocalizedString | null;
  builtin: Partial<Record<LocaleCode, string>> | null;
}

// Status and Priority Enums

export type ReportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type ReportPriority = 'lowest' | 'low' | 'medium' | 'high' | 'highest';
export type ReportSource = 'widget' | 'manual' | 'portal';

/** URL/query value for filtering reports with no assignee */
export const UNASSIGNED_FILTER = '__unassigned__';

/** URL/query value for filtering reports assigned to the signed-in user */
export const ASSIGNED_TO_ME_FILTER = '__me__';

/** Report statuses in workflow order */
export const REPORT_STATUSES = [
  'open',
  'in_progress',
  'resolved',
  'closed',
] as const satisfies readonly ReportStatus[];

/** Statuses of reports that still need work */
export const ACTIVE_REPORT_STATUSES: ReportStatus[] = ['open', 'in_progress'];

/** Report priorities from most to least urgent */
export const REPORT_PRIORITIES = [
  'highest',
  'high',
  'medium',
  'low',
  'lowest',
] as const satisfies readonly ReportPriority[];

export const REPORT_VIEWS = ['list', 'board'] as const;
export type ReportView = (typeof REPORT_VIEWS)[number];

export const REPORT_SORT_KEYS = [
  'createdAt',
  'updatedAt',
  'title',
  'project',
  'status',
  'priority',
  'assignee',
  'position',
] as const;
export type ReportSortKey = (typeof REPORT_SORT_KEYS)[number];

/** Width limits of the resizable navigation sidebar, in pixels */
export const SIDEBAR_WIDTH_DEFAULT = 256;
export const SIDEBAR_WIDTH_MIN = 208;
export const SIDEBAR_WIDTH_MAX = 480;

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const EXPORT_FORMATS = ['markdown', 'plain', 'aiPrompt', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_ACTIONS = ['copy', 'download'] as const;
export type ExportAction = (typeof EXPORT_ACTIONS)[number];

export const TABLE_PAGE_SIZES = [10, 25, 50] as const;
export type TablePageSize = (typeof TABLE_PAGE_SIZES)[number];

/** Per-user Admin Console preferences that follow the user across browsers and devices */
export interface UserPreferences {
  theme?: ThemePreference;
  sidebarWidth?: number;
  sidebarOpen?: boolean;
  pinnedProjectsOpen?: boolean;
  reportDetailsOpen?: boolean;
  reportPageInfoOpen?: boolean;
  reportEnvironmentOpen?: boolean;
  reportMessagesOpen?: boolean;
  dialogPreviewOpen?: boolean;
  projectsPageSize?: TablePageSize;
  reportsPageSize?: TablePageSize;
  reportsView?: ReportView;
  reportsBoardCollapsed?: ReportStatus[];
  lastExport?: { format: ExportFormat; action: ExportAction };
  editorLocale?: LocaleCode;
  dismissedUpdateVersion?: string | null;
  dismissedWidgetWarningId?: string | null;
  /** Achievements the user has already been told about, so each unlock is announced once */
  seenAchievements?: AchievementId[];
  /** Written only through the gamification endpoint; counts only while the workspace lets users opt out */
  gamificationOptedOut?: boolean;
}

export type ReportHistoryAction =
  | 'created'
  | 'status_changed'
  | 'priority_changed'
  | 'assignee_changed'
  | 'owner_assigned'
  | 'owner_removed'
  | 'claimable_set'
  | 'message_hidden'
  | 'message_unhidden';

export type ReporterAuthTokenSource = 'request' | 'confirmation' | 'invitation';
export type ReporterSuppressionSource = 'portal' | 'unsubscribe';

export interface Reporter {
  id: string;
  email: string;
  displayName: string;
  locale: string;
  suspendedAt: string | null;
  suspendedByUserId: string | null;
  sessionsRevokedAt: string | null;
  sessionsRevokedByUserId: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReporterPortalProjectSettings {
  enabled: boolean;
  allowNewFeedback: boolean;
}

export interface ReporterPortalLimits {
  loginRequestsPerEmailPer15Min: number;
  loginRequestsPerIpPer15Min: number;
  loginExchangesPerIpPer15Min: number;
  messagesPerReporterPerMinute: number;
  messagesPerReporterPerDay: number;
  submissionsPerReporterPerHour: number;
  submissionsPerReporterPerDay: number;
  sseStreamsPerSession: number;
  uploadMbPerReporterPerDay: number;
}

export const DEFAULT_REPORTER_PORTAL_LIMITS: ReporterPortalLimits = {
  loginRequestsPerEmailPer15Min: 5,
  loginRequestsPerIpPer15Min: 20,
  loginExchangesPerIpPer15Min: 10,
  messagesPerReporterPerMinute: 10,
  messagesPerReporterPerDay: 100,
  submissionsPerReporterPerHour: 5,
  submissionsPerReporterPerDay: 20,
  sseStreamsPerSession: 3,
  uploadMbPerReporterPerDay: 200,
};
export type ManualReportChannel = 'email' | 'chat' | 'phone' | 'qa' | 'other';
export type UserRole = 'admin' | 'editor' | 'viewer';
export type FileType = 'screenshot' | 'video' | 'attachment';
export type GitHubSyncStatus = 'pending' | 'synced' | 'error';
export type GitHubSyncMode = 'manual' | 'automatic';
export type UserActivityCapturePolicy = 'automatic' | 'disabled';

export interface PrivacySettings {
  euPrivacyMode: boolean;
}

/** Which diagnostics the widget attaches to reports. Projects can override each value. */
export interface DiagnosticSettings {
  activityCapture: boolean;
  consoleCapture: boolean;
  networkCapture: boolean;
  storageKeysCapture: boolean;
}

export const DEFAULT_DIAGNOSTIC_SETTINGS: DiagnosticSettings = {
  activityCapture: true,
  consoleCapture: true,
  networkCapture: true,
  storageKeysCapture: false,
};

// Report Types

export interface ManualReportContext {
  channel?: ManualReportChannel;
  submittedByUserId?: string;
}

export interface ReportMetadata {
  url?: string;
  title?: string;
  referrer?: string;
  browser?: {
    name: string;
    version: string;
    userAgent: string;
  };
  device?: {
    type: 'desktop' | 'tablet' | 'mobile';
    os: string;
    osVersion?: string;
  };
  viewport?: {
    width: number;
    height: number;
    devicePixelRatio: number;
    orientation?: 'landscape' | 'portrait';
  };
  timestamp: string;
  timezone?: string;
  pageLoadTime?: number;
  consoleErrors?: ConsoleError[];
  networkErrors?: NetworkError[];
  userActivity?: UserActivity[];
  storageKeys?: StorageKeys;
  manualContext?: ManualReportContext;
}

export interface ConsoleError {
  type: 'error' | 'warn' | 'log';
  message: string;
  source?: string;
  line?: number;
  timestamp: string;
}

export interface NetworkError {
  url: string;
  method: string;
  status: number;
  statusText: string;
  timestamp: string;
}

export interface UserActivity {
  type: 'button' | 'link' | 'input' | 'select' | 'checkbox' | 'other';
  text?: string; // Button text, link text, input name, etc.
  url?: string; // For link clicks
  inputType?: string; // For input elements (text, email, password, etc.)
  timestamp: string;
}

export interface StorageKeys {
  cookies: string[];
  localStorage: string[];
  sessionStorage: string[];
}

export interface Report {
  licenseLocked?: boolean;
  id: string;
  projectId: string;
  projectName?: string; // Only populated in list queries with JOIN
  source: ReportSource;
  title: string;
  description?: string;
  status: ReportStatus;
  priority: ReportPriority;
  annotations?: object;
  metadata: ReportMetadata;
  reporterEmail?: string;
  reporterName?: string;
  reporterLocale: LocaleCode;
  reporterId?: string;
  owner?: ReportOwner;
  claimableEmail?: string;
  originalDescription?: string;
  originalDescriptionBackfilled?: boolean;
  ownerSeenAt?: string;
  lastReporterActivityAt?: string;
  reporterActivitySeenAt?: string;
  assignedTo?: string;
  assignee?: ReportAssignee;
  customFields?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  closedAt?: string;
  forwardedTo?: ForwardedReference[];
  // GitHub sync fields
  githubSyncStatus?: GitHubSyncStatus | null;
  githubSyncError?: string | null;
  githubIssueNumber?: number | null;
  githubIssueUrl?: string | null;
  githubSyncedAt?: string | null;
}

export interface ForwardedReference {
  type: 'github' | 'jira' | 'linear' | 'webhook';
  id: string;
  url?: string;
  forwardedAt?: string;
}

export interface ReportAssignee {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

// Shared color settings type (used by ThemeColorPicker)
export interface ThemeColors {
  lightButtonColor: string;
  lightTextColor: string;
  lightButtonHoverColor: string;
  lightTextHoverColor: string;
  lightBackgroundColor?: string;
  lightSecondaryColor?: string;
  lightInputColor?: string;
  lightForegroundColor?: string;
  lightSecondaryButtonColor?: string;
  lightSecondaryButtonTextColor?: string;
  lightSecondaryButtonHoverColor?: string;
  lightSecondaryButtonTextHoverColor?: string;
  lightTabBarColor?: string;
  lightActiveTabColor?: string;
  lightActiveTabTextColor?: string;
  lightTabTextColor?: string;
  lightTabTextHoverColor?: string;
  darkButtonColor: string;
  darkTextColor: string;
  darkButtonHoverColor: string;
  darkTextHoverColor: string;
  darkBackgroundColor?: string;
  darkSecondaryColor?: string;
  darkInputColor?: string;
  darkForegroundColor?: string;
  darkSecondaryButtonColor?: string;
  darkSecondaryButtonTextColor?: string;
  darkSecondaryButtonHoverColor?: string;
  darkSecondaryButtonTextHoverColor?: string;
  darkTabBarColor?: string;
  darkActiveTabColor?: string;
  darkActiveTabTextColor?: string;
  darkTabTextColor?: string;
  darkTabTextHoverColor?: string;
}

// Widget Launcher Button settings
export interface WidgetLauncherButtonSettings {
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  buttonText?: LocalizedString | null;
  buttonShape?: 'round' | 'rectangle';
  buttonIcon?: string | null;
  buttonIconSize?: number;
  buttonIconStroke?: number;
  buttonOffsetX?: number;
  buttonOffsetY?: number;
  buttonSizeUnit?: 'px' | 'rem';
  theme?: 'auto' | 'light' | 'dark';
  enableHoverScaleEffect?: boolean;
  tooltipEnabled?: boolean;
  tooltipText?: LocalizedString | null;
  // Colors
  lightButtonColor?: string;
  lightTextColor?: string;
  lightButtonHoverColor?: string;
  lightTextHoverColor?: string;
  darkButtonColor?: string;
  darkTextColor?: string;
  darkButtonHoverColor?: string;
  darkTextHoverColor?: string;
}

// Texts and fields of the report dialog; a null text uses the widget's built-in translation
export interface WidgetDialogContentSettings {
  title?: LocalizedString | null;
  titlePlaceholder?: LocalizedString | null;
  descriptionPlaceholder?: LocalizedString | null;
  submitButtonText?: LocalizedString | null;
  showPriority?: boolean;
}

export interface GlobalWidgetDialogContentSettings {
  title: LocalizedString | null;
  titlePlaceholder: LocalizedString | null;
  descriptionPlaceholder: LocalizedString | null;
  submitButtonText: LocalizedString | null;
  showPriority: boolean;
}

// Widget Dialog settings (button colors inside the dialog)
export interface WidgetDialogSettings {
  lightButtonColor?: string;
  lightTextColor?: string;
  lightButtonHoverColor?: string;
  lightTextHoverColor?: string;
  lightBackgroundColor?: string;
  lightSecondaryColor?: string;
  lightInputColor?: string;
  lightForegroundColor?: string;
  lightSecondaryButtonColor?: string;
  lightSecondaryButtonTextColor?: string;
  lightSecondaryButtonHoverColor?: string;
  lightSecondaryButtonTextHoverColor?: string;
  lightTabBarColor?: string;
  lightActiveTabColor?: string;
  lightActiveTabTextColor?: string;
  lightTabTextColor?: string;
  lightTabTextHoverColor?: string;
  darkButtonColor?: string;
  darkTextColor?: string;
  darkButtonHoverColor?: string;
  darkTextHoverColor?: string;
  darkBackgroundColor?: string;
  darkSecondaryColor?: string;
  darkInputColor?: string;
  darkForegroundColor?: string;
  darkSecondaryButtonColor?: string;
  darkSecondaryButtonTextColor?: string;
  darkSecondaryButtonHoverColor?: string;
  darkSecondaryButtonTextHoverColor?: string;
  darkTabBarColor?: string;
  darkActiveTabColor?: string;
  darkActiveTabTextColor?: string;
  darkTabTextColor?: string;
  darkTabTextHoverColor?: string;
}

// Screenshot settings
export interface ScreenshotSettings {
  useScreenCaptureAPI?: boolean;
  maxScreenshotSize?: number;
  maxImageUploadSizeMb?: number;
  maxVideoUploadSizeMb?: number;
  maxVideoUploadMbPerDay?: number;
  enableScreenRecording?: boolean;
  allowRecordingMicrophone?: boolean;
  maxRecordingDurationSeconds?: number;
  recordingQuality?: RecordingQuality;
}

// Project language settings
export type ProjectLanguageMode = 'auto' | 'manual';

export interface ProjectLanguageSettings {
  mode: ProjectLanguageMode;
  defaultLanguage: LocaleCode;
}

// Project Types

export interface ProjectSettings {
  reporterPortal?: ReporterPortalProjectSettings;
  defaultAssigneeUserId?: string | null;
  widgetLauncherButton?: WidgetLauncherButtonSettings;
  widgetDialog?: WidgetDialogSettings;
  widgetDialogContent?: WidgetDialogContentSettings;
  // Missing or null: inherit the instance-wide language setting. null clears an override on PATCH.
  language?: ProjectLanguageSettings | null;
  screenshot?: ScreenshotSettings;
  activityCapture?: boolean;
  consoleCapture?: boolean;
  networkCapture?: boolean;
  storageKeysCapture?: boolean;
  security?: {
    allowedOrigins?: string[];
  };
  branding?: {
    logoUrl?: string;
    companyName?: string;
    primaryColor?: string;
    accentColor?: string;
    poweredByVisible?: boolean;
  };
  fields?: {
    titleRequired?: boolean;
    titlePlaceholder?: string;
    descriptionRequired?: boolean;
    descriptionPlaceholder?: string;
    priorityVisible?: boolean;
    priorityDefault?: ReportPriority;
    emailVisible?: boolean;
    emailRequired?: boolean;
    customFields?: CustomField[];
  };
  notifyReporter?: boolean;
  reporterNotifications?: Partial<ReporterNotificationSettings>;
  // Legacy widget settings (for backward compatibility during migration)
  widget?: {
    enabled?: boolean;
    showOnMobile?: boolean;
    captureMethod?: 'visible' | 'fullpage' | 'element';
    rateLimit?: number;
  };
}

/** Project settings PATCH body: null removes a project override so the instance default applies. */
export type ProjectSettingsUpdate = {
  [K in keyof ProjectSettings]?: ProjectSettings[K] | null;
};

export interface CustomField {
  id: string;
  label: string;
  type: 'text' | 'select' | 'checkbox';
  required?: boolean;
  options?: string[];
}

export interface Project {
  reporterPortalPrerequisites?: string[];
  licenseLocked?: boolean;
  id: string;
  name: string;
  apiKey: string;
  settings: ProjectSettings;
  reportsCount: number;
  isActive: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export type ProjectSummary = Pick<Project, 'id' | 'name' | 'isActive' | 'licenseLocked'> & {
  activeReportsCount?: number;
  reportsCount?: number;
  createdAt?: string;
  lastReportAt?: string | null;
  integrationTypes?: IntegrationType[];
  apiKeyPrefix?: string;
};

export type PinnedProject = ProjectSummary & { activeReportsCount: number };

export interface RecentReport {
  id: string;
  title: string;
  projectId: string;
  status: ReportStatus;
  viewedAt: string;
}

export interface ReportViewCounts {
  assignedToMe: number;
  unassigned: number;
  active: number;
}

export interface DefaultProjectReference {
  id: string;
  name: string;
}

// User Types

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword?: boolean;
  /** Non-admins can create and use API tokens only while this is true */
  apiAccessEnabled?: boolean;
  /** Levels and achievements show on the dashboard only while this and the workspace switch are on */
  gamificationEnabled?: boolean;
  passwordChangedAt?: string;
  /** True when the user has a confirmed authenticator app or at least one passkey */
  twoFactorEnabled?: boolean;
  /** True when the two-factor policy covers the user and no second factor is set up yet */
  twoFactorSetupRequired?: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  invitationSentAt?: string;
  invitationAcceptedAt?: string;
  defaultProjects?: DefaultProjectReference[];
}

export type TwoFactorPolicy = 'off' | 'admins' | 'everyone';

export interface Passkey {
  id: string;
  name: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

export interface TwoFactorStatus {
  totpEnabled: boolean;
  passkeys: Passkey[];
  recoveryCodesRemaining: number;
  policy: TwoFactorPolicy;
  setupRequired: boolean;
}

export interface Session {
  id: string;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  expiresAt: string;
  lastActivityAt: string;
}

// File Types

export interface FileRecord {
  id: string;
  reportId: string;
  messageId: string | null;
  uploadedByReporterId: string | null;
  type: FileType;
  filename: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  createdAt: string;
}

// Webhook Types

export type WebhookEvent =
  | 'report.created'
  | 'report.updated'
  | 'report.status_changed'
  | 'report.assigned'
  | 'report.resolved'
  | 'report.closed'
  | 'report.deleted';

export interface Webhook {
  id: string;
  projectId: string;
  name: string;
  url: string;
  secret?: string;
  events: WebhookEvent[];
  isActive: boolean;
  lastTriggeredAt?: string;
  lastStatusCode?: number;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
}

/** A webhook as the API returns it: the signing secret is write-only. */
export type WebhookResponse = Omit<Webhook, 'secret'> & { secretSet: boolean };

// API Request/Response Types

export interface CreateReportRequest {
  apiKey: string;
  title: string;
  description?: string;
  priority?: ReportPriority;
  screenshot: Blob | File;
  annotations?: object;
  metadata: ReportMetadata;
  reporterEmail?: string;
  reporterName?: string;
}

export interface ReportFilter {
  reporterId?: string;
  projectId?: string;
  source?: ReportSource;
  status?: ReportStatus[];
  priority?: ReportPriority[];
  assignedTo?: string;
  search?: string;
  createdAfter?: string;
  createdBefore?: string;
  page?: number;
  limit?: number;
  sortBy?: ReportSortKey;
  sortOrder?: 'asc' | 'desc';
  /** Cursor from a previous page's `nextCursor`; takes the place of `page` */
  after?: string;
}

/** The reports a board shows, which limits the cards a drop on a sorted board reorders */
export type ReportBoardScope = Pick<
  ReportFilter,
  'projectId' | 'reporterId' | 'status' | 'priority' | 'assignedTo' | 'search'
>;

/** Where a report is dropped on the board */
export interface ReportBoardMove {
  status: ReportStatus;
  previousId?: string | null;
  nextId?: string | null;
  /** Saves this sort as the hand-made order of the scoped reports before placing the report */
  adoptSort?: {
    sortBy: ReportSortKey;
    sortOrder: 'asc' | 'desc';
    scope?: ReportBoardScope;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  /** Cursor for the page after this one, when the endpoint supports cursor paging */
  nextCursor?: string | null;
}

// Notification default settings
export interface NotificationDefaultSettings {
  emailEnabled: boolean;
  notifyOnNewReport: boolean;
  notifyOnStatusChange: boolean;
  notifyOnPriorityChange: boolean;
  notifyOnAssignment: boolean;
  notifyOnDeletion: boolean;
}

// Reporter notification settings
export interface ReporterNotificationSettings {
  emailEnabled: boolean;
  notifyOnNewReport: boolean;
  notifyOnStatusChange: boolean;
  notifyOnPriorityChange: boolean;
  notifyOnAssignment: boolean;
  messagingEnabled: boolean;
}

// Admin Console button colors
export interface AdminButtonColors {
  lightButtonColor: string;
  lightTextColor: string;
  lightButtonHoverColor: string;
  lightTextHoverColor: string;
  darkButtonColor: string;
  darkTextColor: string;
  darkButtonHoverColor: string;
  darkTextHoverColor: string;
}

// White-label settings (EE feature)
export interface WhiteLabelSettings {
  enabled: boolean;
  hideFooterBranding: boolean;
  hideEmailBranding: boolean;
  hidePoweredBy: boolean;
  customCopyright?: string;
}

// Branding settings
export interface BrandingSettings {
  primaryColor: string;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  iconLightUrl: string | null;
  iconDarkUrl: string | null;
  faviconLightVersion: string;
  faviconDarkVersion: string;
}

// Required version of WidgetLauncherButtonSettings for global settings
export interface GlobalWidgetLauncherButtonSettings {
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  buttonText: LocalizedString | null;
  buttonShape: 'round' | 'rectangle';
  buttonIcon: string | null;
  buttonIconSize: number;
  buttonIconStroke: number;
  buttonOffsetX: number;
  buttonOffsetY: number;
  buttonSizeUnit: 'px' | 'rem';
  theme: 'auto' | 'light' | 'dark';
  enableHoverScaleEffect: boolean;
  tooltipEnabled: boolean;
  tooltipText: LocalizedString | null;
  lightButtonColor: string;
  lightTextColor: string;
  lightButtonHoverColor: string;
  lightTextHoverColor: string;
  darkButtonColor: string;
  darkTextColor: string;
  darkButtonHoverColor: string;
  darkTextHoverColor: string;
}

// Required version of ScreenshotSettings for global settings
export interface GlobalScreenshotSettings {
  useScreenCaptureAPI: boolean;
  maxScreenshotSize: number;
  maxImageUploadSizeMb: number;
  maxVideoUploadSizeMb: number;
  maxVideoUploadMbPerDay: number;
  enableScreenRecording: boolean;
  allowRecordingMicrophone: boolean;
  maxRecordingDurationSeconds: number;
  recordingQuality: RecordingQuality;
}

// Settings Types

export interface AppSettings {
  // System settings
  appName: string;
  appUrl: string;
  portalBaseUrl: string;
  reporterPortalLimits: ReporterPortalLimits;
  retentionDays: number;
  rateLimitPerMinute: number;
  sessionMaxAgeDays: number;
  invitationExpirationDays: number;
  updateCheckEnabled: boolean;
  // Security settings
  enforceHttps: boolean;
  twoFactorPolicy: TwoFactorPolicy;
  passwordPolicy: PasswordPolicy;
  // Privacy settings
  privacy: PrivacySettings;
  // Diagnostics defaults for every project
  diagnostics: DiagnosticSettings;
  // SMTP settings
  smtpEnabled: boolean;
  smtpConfig: {
    host?: string;
    port?: number;
    user?: string;
    /** Write-only: never returned by the API. Leave empty on save to keep the stored password. */
    password?: string;
    /** Read-only: whether a password is stored. */
    passwordSet?: boolean;
    from?: string;
  };
  // S3 settings
  s3Enabled: boolean;
  s3Config: {
    bucket?: string;
    region?: string;
    accessKeyId?: string;
    /** Write-only: never returned by the API. Leave empty on save to keep the stored key. */
    secretAccessKey?: string;
    /** Read-only: whether a secret access key is stored. */
    secretAccessKeySet?: boolean;
    endpoint?: string;
  };
  // Widget settings (nested structure - same as ProjectSettings)
  widgetLauncherButton: GlobalWidgetLauncherButtonSettings;
  widgetDialog: ThemeColors;
  widgetDialogContent: GlobalWidgetDialogContentSettings;
  screenshot: GlobalScreenshotSettings;
  // Notification defaults
  notifications: NotificationDefaultSettings;
  // Branding settings
  branding: BrandingSettings;
  // Admin Console settings
  adminButton: AdminButtonColors;
  // Reporter notification settings
  reporterNotifications: ReporterNotificationSettings;
  // Email templates (optional - uses defaults if not set)
  emailTemplates?: EmailTemplates;
  // Language settings (instance-wide default)
  language: ProjectLanguageSettings;
  // White-label settings (EE feature)
  whiteLabel?: WhiteLabelSettings;
}

// Integration Types

export type IntegrationType = 'github' | 'jira' | 'slack' | 'linear' | 'webhook';

export interface Integration {
  id: string;
  projectId: string;
  type: IntegrationType;
  name: string;
  config: IntegrationConfig;
  isActive: boolean;
  lastUsedAt?: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubIntegrationConfig {
  owner: string;
  repo: string;
  accessToken: string; // Masked in API responses
  labels?: string[];
  assignees?: string[];
  syncMode?: GitHubSyncMode; // 'manual' (default) or 'automatic'
  webhookId?: string; // GitHub webhook ID for bi-directional sync
  webhookSecret?: string; // Secret for verifying GitHub webhook payloads
  fileTransferMode?: 'link' | 'upload'; // 'link' (default) or 'upload' files to GitHub repo
  publicVideoLinks?: boolean;
}

export interface JiraIntegrationConfig {
  domain: string;
  email: string;
  apiToken: string;
  projectKey: string;
  issueType: string;
  customFields?: Record<string, string>;
}

export interface SlackIntegrationConfig {
  webhookUrl: string;
  channel?: string;
  notifyOn: WebhookEvent[];
  includeScreenshot?: boolean;
}

export type IntegrationConfig =
  GitHubIntegrationConfig | JiraIntegrationConfig | SlackIntegrationConfig;

// Notification Types

export interface NotificationPreferences {
  id: string;
  userId: string;
  projectId: string;
  notifyOnNewReport: boolean;
  notifyOnStatusChange: boolean;
  notifyOnPriorityChange: boolean;
  notifyOnAssignment: boolean;
  notifyOnDeletion: boolean;
  emailEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectNotificationDefaults {
  id: string;
  projectId: string;
  defaultNotifyOnNewReport: boolean;
  defaultNotifyOnStatusChange: boolean;
  defaultNotifyOnPriorityChange: boolean;
  defaultNotifyOnAssignment: boolean;
  defaultNotifyOnDeletion: boolean;
  defaultEmailEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// API Token Types

export type ApiTokenScope = 'read' | 'write' | 'admin';

export interface ApiToken {
  id: string;
  userId: string;
  name: string;
  tokenPrefix: string;
  scopes: ApiTokenScope[];
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
  revokedAt?: string;
}

// Email Template Types

export type ReporterTemplateType =
  | 'reporterLogin'
  | 'reporterConfirmation'
  | 'reporterStatusChange'
  | 'reporterPriorityChange'
  | 'reporterMessage'
  | 'reporterAssignment';

export type TeamTemplateType =
  | 'newReport'
  | 'statusChange'
  | 'priorityChange'
  | 'assignment'
  | 'reportDeleted'
  | 'invitation'
  | 'passwordReset'
  | 'testEmail';

export type EmailTemplateType = ReporterTemplateType | TeamTemplateType;

export interface EmailTemplate {
  subject: string;
  html: string;
}

export type ReporterTemplateDefaults = Record<LocaleCode, EmailTemplate>;

export type TeamTemplateDefaults = { en: EmailTemplate } & Partial<
  Record<LocaleCode, EmailTemplate>
>;

export type DefaultEmailTemplates = { [K in ReporterTemplateType]: ReporterTemplateDefaults } & {
  [K in TeamTemplateType]: TeamTemplateDefaults;
};

export type CustomEmailTemplates = Partial<{
  [K in EmailTemplateType]: Partial<Record<LocaleCode, EmailTemplate>>;
}>;

export interface EmailTemplates {
  reporterLogin: EmailTemplate;
  newReport: EmailTemplate;
  statusChange: EmailTemplate;
  priorityChange: EmailTemplate;
  assignment: EmailTemplate;
  invitation: EmailTemplate;
  reportDeleted: EmailTemplate;
  testEmail: EmailTemplate;
  reporterConfirmation: EmailTemplate;
  reporterStatusChange: EmailTemplate;
  reporterPriorityChange: EmailTemplate;
  reporterMessage: EmailTemplate;
  reporterAssignment: EmailTemplate;
}

export type MessageAuthorKind = 'staff' | 'reporter';

export interface ReportMessage {
  id: string;
  reportId: string;
  authorKind: MessageAuthorKind;
  userId: string | null;
  reporterId: string | null;
  authorName: string;
  body: string;
  hiddenAt: string | null;
  hiddenByUserId: string | null;
  files: FileRecord[];
  createdAt: string;
}

export interface ReporterMessage {
  id: string;
  reportId: string;
  userId: string | null;
  authorKind: MessageAuthorKind;
  reporterId: string | null;
  authorName: string;
  files: FileRecord[];
  hiddenAt: string | null;
  userName?: string;
  message: string;
  sentAt: string;
  createdAt: string;
}

export interface ReportHistoryEntry {
  id: string;
  reportId: string;
  userId?: string;
  userName?: string;
  action: ReportHistoryAction;
  oldValue?: string;
  newValue?: string;
  oldDisplay?: string;
  newDisplay?: string;
  createdAt: string;
}

// Dashboard

export const DASHBOARD_RANGES = [7, 30, 90] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export interface DashboardKpi {
  value: number | null;
  /** The same measure for the period before, for the trend badge */
  previous: number | null;
  /** One value per day for the last 14 days, oldest first */
  series: (number | null)[];
}

export interface DashboardDayCount {
  /** Calendar day in the requested time zone, YYYY-MM-DD */
  date: string;
  created: number;
  resolved: number;
}

export type AttentionReason = 'reopened' | 'unassigned' | 'stale';

/** A person as the dashboard shows them, without contact details */
export interface DashboardPerson {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface DashboardAttentionItem {
  id: string;
  title: string;
  projectName: string;
  status: ReportStatus;
  priority: ReportPriority;
  assignee?: DashboardPerson;
  reason: AttentionReason;
  /** When the reason started: the reopen, the creation, or the last update */
  since: string;
}

/** Who is shown as the author of an activity entry */
export type DashboardActivityActor = 'user' | 'widget' | 'deleted_user' | 'system';

export interface DashboardActivityItem extends ReportHistoryEntry {
  reportTitle: string;
  actor: DashboardActivityActor;
}

export interface DashboardOverview {
  kpis: {
    backlog: DashboardKpi;
    created: DashboardKpi;
    resolved: DashboardKpi;
    resolveHours: DashboardKpi;
  };
  intake: DashboardDayCount[];
  backlogByPriority: Record<ReportPriority, number>;
  needsAttention: DashboardAttentionItem[];
  /** All reports needing attention; the list above shows only the most urgent */
  needsAttentionTotal: number;
  activity: DashboardActivityItem[];
}

/** Days in the personal resolve time window, and in the window before it for the trend */
export const RESOLVE_WINDOW_DAYS = 30;

/** Weeks in the personal resolve time trend chart */
export const RESOLVE_TREND_WEEKS = 12;

/** Days of resolutions behind the personal resolve times by priority */
export const RESOLVE_HISTORY_DAYS = 90;

export interface ResolveTimeWeek {
  weekStart: string;
  mine: number | null;
  team: number | null;
}

export interface ResolveTimeByPriority {
  priority: ReportPriority;
  mine: number | null;
  team: number | null;
}

/**
 * Hours from a report being assigned to the person who resolved it until they resolved it,
 * counted from arrival when it was never assigned to them. Team figures are null when fewer
 * than three people who take part in team statistics resolved reports in that window.
 */
export interface ResolveTimeSummary {
  medianHours: number | null;
  previousMedianHours: number | null;
  teamMedianHours: number | null;
  bestHours: number | null;
  resolvedLast30Days: number;
  weekly: ResolveTimeWeek[];
  byPriority: ResolveTimeByPriority[];
}

export const ACHIEVEMENT_IDS = [
  'hatchling',
  'cocoon',
  'butterfly',
  'firefly',
  'dragonfly',
  'ladybug',
  'web_weaver',
  'amber',
] as const;
export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

/** XP needed to reach each level; level 1 starts at index 0 */
export const LEVEL_XP = [0, 100, 250, 500, 1000, 1500, 2500, 4000, 6000, 10000] as const;

/** Experience points for resolving a report, by its priority */
export const XP_BY_PRIORITY: Record<ReportPriority, number> = {
  highest: 50,
  high: 30,
  medium: 20,
  low: 10,
  lowest: 5,
};

/** Experience points for each message sent to a reporter */
export const XP_PER_REPORTER_MESSAGE = 5;

/** A report resolved this soon after its first assignment (or arrival, if never assigned) earns its XP twice */
export const EARLY_RESOLVE_MINUTES = 60;

/** How many qualifying events unlock each achievement */
export const ACHIEVEMENT_TARGETS: Record<AchievementId, number> = {
  hatchling: 1,
  cocoon: 100,
  butterfly: 500,
  firefly: 1,
  dragonfly: 50,
  ladybug: 25,
  web_weaver: 5,
  amber: 1,
};

/** Firefly: a highest-priority report resolved this soon after its first assignment or arrival */
export const FIREFLY_RESOLVE_HOURS = 4;

/** Dragonfly: the priority of a new report set this soon after it arrived */
export const DRAGONFLY_TRIAGE_MINUTES = 60;

/** Ladybug: a resolved report that is not reopened for this long */
export const LADYBUG_STAYS_FIXED_DAYS = 14;

/** Amber find: a report that waited longer than this before it was resolved */
export const AMBER_WAITED_DAYS = 90;

export interface AchievementProgress {
  id: AchievementId;
  current: number;
  target: number;
  unlockedAt?: string;
}

export interface GamificationProgress {
  xp: number;
  level: number;
  levelStartXp: number;
  /** Null at the top level */
  nextLevelXp: number | null;
  achievements: AchievementProgress[];
}

export interface DashboardPersonal {
  assignedOpen: number;
  oldestAssignedAt: string | null;
  resolvedThisMonth: number;
  resolvedLastMonth: number;
  resolveTime: ResolveTimeSummary;
  /** Null when gamification is off for this user */
  gamification: GamificationProgress | null;
  /**
   * XP that resolving each of the user's open assigned reports would earn right now, by report id.
   * Empty when gamification is off; 0 for a report the user has resolved before.
   */
  resolveXp: Record<string, number>;
}

export interface GamificationUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: UserRole;
  enabled: boolean;
  optedOut: boolean;
}

export interface GamificationSettings {
  enabled: boolean;
  /** Whether users created from now on start with gamification on */
  newUsersDefault: boolean;
  /** Whether users may turn gamification off for themselves */
  allowOptOut: boolean;
  /** Whether the Team tab ranks people by XP; when off it lists them alphabetically */
  showRanking: boolean;
  users: GamificationUser[];
}

export interface TeamMember {
  id: string;
  name: string;
  avatarUrl?: string;
  level: number;
  xp: number;
  /** XP earned within the requested period; equals `xp` for all time */
  periodXp: number;
  achievements: AchievementProgress[];
}

export const TEAM_PERIODS = ['30d', '90d', 'all'] as const;
export type TeamPeriod = (typeof TEAM_PERIODS)[number];

export interface GamificationTeam {
  ranking: boolean;
  period: TeamPeriod;
  members: TeamMember[];
}

/** What the signed-in user may do with their own gamification switch */
export interface GamificationSelf {
  /** The workspace and an admin have it on for this user */
  available: boolean;
  canOptOut: boolean;
  optedOut: boolean;
  /** Available and not opted out: the user sees levels, achievements and the Team tab */
  active: boolean;
}
