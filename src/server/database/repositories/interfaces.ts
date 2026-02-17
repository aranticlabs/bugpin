import type {
  Report,
  ReportFilter,
  ReportStatus,
  ReportPriority,
  ReportMetadata,
  Project,
  ProjectSettings,
  User,
  UserRole,
  Session,
  FileRecord,
  FileType,
  Webhook,
  WebhookEvent,
  Integration,
  IntegrationType,
  IntegrationConfig,
  AppSettings,
  NotificationPreferences,
  ProjectNotificationDefaults,
  ApiToken,
  ApiTokenScope,
} from '@shared/types';

// Report Repository Interface

export interface CreateReportData {
  projectId: string;
  title: string;
  description?: string;
  priority?: ReportPriority;
  annotations?: object;
  metadata: ReportMetadata;
  reporterEmail?: string;
  reporterName?: string;
}

export interface IReportsRepository {
  create(data: CreateReportData): Promise<Report>;
  findById(id: string): Promise<Report | null>;
  find(filter: ReportFilter): Promise<{ data: Report[]; total: number }>;
  update(id: string, updates: Partial<Report>): Promise<Report | null>;
  delete(id: string): Promise<boolean>;
  bulkUpdate(ids: string[], updates: Partial<Report>): Promise<number>;
  countByProject(projectId: string): Promise<number>;
  getStats(projectId?: string): Promise<{
    total: number;
    byStatus: Record<ReportStatus, number>;
    byPriority: Record<ReportPriority, number>;
  }>;
  findIdsOlderThan(days: number): Promise<string[]>;
  updateGitHubSyncStatus(
    id: string,
    data: {
      status: string;
      error?: string | null;
      issueNumber?: number | null;
      issueUrl?: string | null;
    },
  ): Promise<Report | null>;
}

// Project Repository Interface

export interface CreateProjectData {
  name: string;
  settings?: ProjectSettings;
}

export interface IProjectsRepository {
  create(data: CreateProjectData): Promise<Project>;
  findById(id: string): Promise<Project | null>;
  findByApiKey(apiKey: string): Promise<Project | null>;
  findAll(): Promise<Project[]>;
  update(id: string, updates: Partial<Project>): Promise<Project | null>;
  delete(id: string): Promise<boolean>;
  regenerateApiKey(id: string): Promise<string | null>;
  count(): Promise<number>;
}

// User Repository Interface

export interface CreateUserData {
  email: string;
  passwordHash: string;
  name: string;
  role?: UserRole;
  avatarUrl?: string;
}

export interface CreateInvitedUserData {
  email: string;
  name: string;
  role?: UserRole;
  invitationToken: string;
  invitationTokenExpiresAt: string;
}

export interface UserWithPassword extends User {
  passwordHash: string;
}

export interface UserWithInvitationToken extends User {
  invitationToken: string | null;
  invitationTokenExpiresAt: string | null;
}

export interface IUsersRepository {
  create(data: CreateUserData): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByEmailWithPassword(email: string): Promise<UserWithPassword | null>;
  findByRole(role: UserRole): Promise<User[]>;
  findAll(): Promise<User[]>;
  update(id: string, updates: Partial<User>): Promise<User | null>;
  updatePassword(id: string, passwordHash: string): Promise<boolean>;
  updateLastLogin(id: string): Promise<boolean>;
  updateAvatarUrl(id: string, avatarUrl: string | null): Promise<User | null>;
  delete(id: string): Promise<boolean>;
  count(): Promise<number>;
  emailExists(email: string, excludeId?: string): Promise<boolean>;
}

// Session Repository Interface

export interface CreateSessionData {
  userId: string;
  expiresAt: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ISessionsRepository {
  create(data: CreateSessionData): Promise<Session>;
  findById(id: string): Promise<Session | null>;
  findValidById(id: string): Promise<Session | null>;
  findByUserId(userId: string): Promise<Session[]>;
  updateActivity(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
  deleteByUserId(userId: string): Promise<number>;
  deleteExpired(): Promise<number>;
}

// File Repository Interface

export interface CreateFileData {
  reportId: string;
  type: FileType;
  filename: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

export interface IFilesRepository {
  create(data: CreateFileData): Promise<FileRecord>;
  findById(id: string): Promise<FileRecord | null>;
  findByReportId(reportId: string): Promise<FileRecord[]>;
  delete(id: string): Promise<boolean>;
  deleteByReportId(reportId: string): Promise<number>;
}

// Webhook Repository Interface

export interface CreateWebhookData {
  projectId: string;
  name: string;
  url: string;
  secret?: string;
  events?: WebhookEvent[];
}

export interface IWebhooksRepository {
  create(data: CreateWebhookData): Promise<Webhook>;
  findById(id: string): Promise<Webhook | null>;
  findByProjectId(projectId: string): Promise<Webhook[]>;
  findActiveByProjectId(projectId: string): Promise<Webhook[]>;
  findActiveByProjectIdAndEvent(projectId: string, event: WebhookEvent): Promise<Webhook[]>;
  update(id: string, updates: Partial<Webhook>): Promise<Webhook | null>;
  updateLastTriggered(id: string, statusCode: number): Promise<boolean>;
  incrementFailureCount(id: string): Promise<boolean>;
  resetFailureCount(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

// Integration Repository Interface

export interface CreateIntegrationData {
  projectId: string;
  type: IntegrationType;
  name: string;
  config: IntegrationConfig;
  isActive?: boolean;
}

export interface IIntegrationsRepository {
  create(data: CreateIntegrationData): Promise<Integration>;
  findById(id: string): Promise<Integration | null>;
  findByProjectId(projectId: string): Promise<Integration[]>;
  findByProjectIdAndType(projectId: string, type: IntegrationType): Promise<Integration[]>;
  update(id: string, updates: Partial<Integration>): Promise<Integration | null>;
  updateLastUsed(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

// Settings Repository Interface

export interface ISettingsRepository {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  getAll(): Promise<AppSettings>;
  updateAll(updates: Partial<AppSettings>): Promise<AppSettings>;
}

// Notification Preferences Repository Interface

export interface CreateNotificationPreferencesData {
  userId: string;
  projectId: string;
  notifyOnNewReport?: boolean;
  notifyOnStatusChange?: boolean;
  notifyOnPriorityChange?: boolean;
  notifyOnAssignment?: boolean;
  emailEnabled?: boolean;
}

export interface INotificationPreferencesRepository {
  findByUserAndProject(userId: string, projectId: string): Promise<NotificationPreferences | null>;
  findByProject(projectId: string): Promise<NotificationPreferences[]>;
  findByUser(userId: string): Promise<NotificationPreferences[]>;
  upsert(data: CreateNotificationPreferencesData): Promise<NotificationPreferences>;
  delete(userId: string, projectId: string): Promise<boolean>;
  getProjectDefaults(projectId: string): Promise<ProjectNotificationDefaults | null>;
  upsertProjectDefaults(
    projectId: string,
    defaults: Partial<ProjectNotificationDefaults>,
  ): Promise<ProjectNotificationDefaults>;
}

// API Token Repository Interface

export interface CreateApiTokenData {
  userId: string;
  name: string;
  scopes?: ApiTokenScope[];
  expiresAt?: string;
}

export interface ApiTokenWithHash extends ApiToken {
  tokenHash: string;
}

export interface IApiTokensRepository {
  create(data: CreateApiTokenData): Promise<{ token: ApiToken; rawToken: string }>;
  findById(id: string): Promise<ApiToken | null>;
  findByTokenHash(tokenHash: string): Promise<ApiTokenWithHash | null>;
  findByUserId(userId: string): Promise<ApiToken[]>;
  updateLastUsed(id: string): Promise<boolean>;
  revoke(id: string): Promise<boolean>;
  revokeAllForUser(userId: string): Promise<number>;
  deleteExpired(): Promise<number>;
}
