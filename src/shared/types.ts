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
export type ReportSource = 'widget' | 'manual';

/** URL/query value for filtering reports with no assignee */
export const UNASSIGNED_FILTER = '__unassigned__';

export type ReportHistoryAction =
  | 'created'
  | 'status_changed'
  | 'priority_changed'
  | 'assignee_changed';
export type ManualReportChannel = 'email' | 'chat' | 'phone' | 'qa' | 'other';
export type UserRole = 'admin' | 'editor' | 'viewer';
export type FileType = 'screenshot' | 'video' | 'attachment';
export type GitHubSyncStatus = 'pending' | 'synced' | 'error';
export type GitHubSyncMode = 'manual' | 'automatic';
export type UserActivityCapturePolicy = 'automatic' | 'disabled';

export interface PrivacySettings {
  euPrivacyMode: boolean;
}

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
  darkButtonColor: string;
  darkTextColor: string;
  darkButtonHoverColor: string;
  darkTextHoverColor: string;
  darkBackgroundColor?: string;
  darkSecondaryColor?: string;
  darkInputColor?: string;
  darkForegroundColor?: string;
}

// Widget Launcher Button settings
export interface WidgetLauncherButtonSettings {
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  buttonText?: LocalizedString | null;
  buttonShape?: 'round' | 'rectangle';
  buttonIcon?: string | null;
  buttonIconSize?: number;
  buttonIconStroke?: number;
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
  darkButtonColor?: string;
  darkTextColor?: string;
  darkButtonHoverColor?: string;
  darkTextHoverColor?: string;
  darkBackgroundColor?: string;
  darkSecondaryColor?: string;
  darkInputColor?: string;
  darkForegroundColor?: string;
}

// Screenshot settings
export interface ScreenshotSettings {
  useScreenCaptureAPI?: boolean;
  maxScreenshotSize?: number;
  maxImageUploadSizeMb?: number;
  maxVideoUploadSizeMb?: number;
}

// Project language settings
export type ProjectLanguageMode = 'auto' | 'manual';

export interface ProjectLanguageSettings {
  mode: ProjectLanguageMode;
  defaultLanguage: LocaleCode;
}

// Project Types

export interface ProjectSettings {
  defaultAssigneeUserId?: string | null;
  widgetLauncherButton?: WidgetLauncherButtonSettings;
  widgetDialog?: WidgetDialogSettings;
  language?: ProjectLanguageSettings;
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

export interface CustomField {
  id: string;
  label: string;
  type: 'text' | 'select' | 'checkbox';
  required?: boolean;
  options?: string[];
}

export interface Project {
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
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  invitationSentAt?: string;
  invitationAcceptedAt?: string;
  defaultProjects?: DefaultProjectReference[];
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
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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
}

// Settings Types

export interface AppSettings {
  // System settings
  appName: string;
  appUrl: string;
  retentionDays: number;
  rateLimitPerMinute: number;
  sessionMaxAgeDays: number;
  invitationExpirationDays: number;
  updateCheckEnabled: boolean;
  // Security settings
  enforceHttps: boolean;
  // Privacy settings
  privacy: PrivacySettings;
  // SMTP settings
  smtpEnabled: boolean;
  smtpConfig: {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    from?: string;
  };
  // S3 settings
  s3Enabled: boolean;
  s3Config: {
    bucket?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
  };
  // Widget settings (nested structure - same as ProjectSettings)
  widgetLauncherButton: GlobalWidgetLauncherButtonSettings;
  widgetDialog: ThemeColors;
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
  | GitHubIntegrationConfig
  | JiraIntegrationConfig
  | SlackIntegrationConfig;

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

export interface ReporterMessage {
  id: string;
  reportId: string;
  userId: string;
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
