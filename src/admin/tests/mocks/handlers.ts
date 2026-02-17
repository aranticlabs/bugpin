import { http, HttpResponse } from 'msw';

// Mock data
export const mockUsers = {
  admin: {
    id: 'user-1',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin' as const,
  },
  editor: {
    id: 'user-2',
    email: 'editor@example.com',
    name: 'Editor User',
    role: 'editor' as const,
  },
  viewer: {
    id: 'user-3',
    email: 'viewer@example.com',
    name: 'Viewer User',
    role: 'viewer' as const,
  },
  pending: {
    id: 'user-4',
    email: 'pending@example.com',
    name: 'Pending User',
    role: 'viewer' as const,
    invitationSentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
  },
};

export const mockProjects = [
  {
    id: 'project-1',
    name: 'Test Project',
    apiKey: 'test-api-key-123',
    reportsCount: 5,
    isActive: true,
    position: 0,
  },
  {
    id: 'project-2',
    name: 'Another Project',
    apiKey: 'test-api-key-456',
    reportsCount: 12,
    isActive: true,
    position: 1,
  },
];

export const mockReports = [
  {
    id: 'report-1',
    title: 'Button not working',
    description: 'The submit button does not respond to clicks',
    status: 'open',
    priority: 'high',
    projectId: 'project-1',
    reporterEmail: 'user@example.com',
    reporterName: 'John Doe',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:30:00Z',
    metadata: {
      url: 'https://example.com/page',
      browser: { name: 'Chrome', version: '120.0.0' },
      device: { type: 'desktop', os: 'macOS', osVersion: '14.0' },
      viewport: { width: 1920, height: 1080 },
      consoleErrors: [],
    },
    githubSyncStatus: 'synced' as const,
    githubIssueNumber: 42,
    githubIssueUrl: 'https://github.com/testorg/testrepo/issues/42',
    githubSyncedAt: '2024-01-15T10:35:00Z',
  },
  {
    id: 'report-2',
    title: 'Page layout broken',
    description: 'The page layout is broken on mobile',
    status: 'in_progress',
    priority: 'medium',
    projectId: 'project-1',
    reporterEmail: 'another@example.com',
    reporterName: 'Jane Smith',
    createdAt: '2024-01-14T09:00:00Z',
    updatedAt: '2024-01-15T11:00:00Z',
    metadata: {
      url: 'https://example.com/mobile',
      browser: { name: 'Safari', version: '17.0' },
      device: { type: 'mobile', os: 'iOS', osVersion: '17.0' },
      viewport: { width: 390, height: 844 },
      consoleErrors: [{ message: 'TypeError: Cannot read property' }],
    },
    githubSyncStatus: 'error' as const,
    githubSyncError: 'GitHub API rate limit exceeded',
  },
  {
    id: 'report-3',
    title: 'Form validation issue',
    description: 'Form does not validate email properly',
    status: 'open',
    priority: 'low',
    projectId: 'project-1',
    reporterEmail: 'test@example.com',
    reporterName: 'Test User',
    createdAt: '2024-01-16T08:00:00Z',
    updatedAt: '2024-01-16T08:00:00Z',
    metadata: {
      url: 'https://example.com/form',
      browser: { name: 'Firefox', version: '121.0' },
      device: { type: 'desktop', os: 'Windows', osVersion: '11' },
      viewport: { width: 1440, height: 900 },
      consoleErrors: [],
    },
    githubSyncStatus: 'pending' as const,
  },
];

export const mockBrandingConfig = {
  primaryColor: '#0f172a',
  logoLightUrl: '/branding/light/logo-light.svg',
  logoDarkUrl: '/branding/dark/logo-dark.svg',
  iconLightUrl: '/branding/light/icon-light.svg',
  iconDarkUrl: '/branding/dark/icon-dark.svg',
  faviconLightVersion: 'v1',
  faviconDarkVersion: 'v1',
  adminThemeColors: {
    lightButtonColor: '#1d4ed8',
    lightTextColor: '#ffffff',
    lightButtonHoverColor: '#1e40af',
    lightTextHoverColor: '#ffffff',
    darkButtonColor: '#38bdf8',
    darkTextColor: '#0f172a',
    darkButtonHoverColor: '#0ea5e9',
    darkTextHoverColor: '#0f172a',
  },
  widgetPrimaryColors: {
    lightButtonColor: '#10b981',
    lightTextColor: '#ffffff',
    lightButtonHoverColor: '#059669',
    lightTextHoverColor: '#ffffff',
    darkButtonColor: '#34d399',
    darkTextColor: '#0f172a',
    darkButtonHoverColor: '#10b981',
    darkTextHoverColor: '#0f172a',
  },
};

export const mockStats = {
  total: 17,
  byStatus: {
    open: 8,
    in_progress: 4,
    resolved: 3,
    closed: 2,
  },
  byPriority: {
    highest: 2,
    high: 5,
    medium: 6,
    low: 3,
    lowest: 1,
  },
};

// Default handlers
export const handlers = [
  // Auth endpoints
  http.get('/api/auth/me', () => {
    return HttpResponse.json({
      success: true,
      authenticated: true,
      user: mockUsers.admin,
    });
  }),

  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };

    if (body.email === 'admin@example.com' && body.password === 'password123') {
      return HttpResponse.json({
        success: true,
        user: mockUsers.admin,
      });
    }

    return HttpResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
  }),

  http.post('/api/auth/logout', () => {
    return HttpResponse.json({ success: true });
  }),

  // Branding endpoints
  http.get('/api/branding/config', () => {
    return HttpResponse.json({
      success: true,
      config: mockBrandingConfig,
    });
  }),

  // User profile endpoints
  http.patch('/api/users/me/profile', async ({ request }) => {
    const body = (await request.json()) as { name?: string; email?: string };
    return HttpResponse.json({
      success: true,
      user: { ...mockUsers.admin, ...body },
    });
  }),

  http.post('/api/users/me/avatar', () => {
    return HttpResponse.json({
      success: true,
      url: '/uploads/avatar.png',
    });
  }),

  http.delete('/api/users/me/avatar', () => {
    return HttpResponse.json({ success: true });
  }),

  // Reports endpoints
  http.get('/api/reports', ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const priority = url.searchParams.get('priority');
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    let filtered = [...mockReports];
    if (status) filtered = filtered.filter((r) => r.status === status);
    if (priority) filtered = filtered.filter((r) => r.priority === priority);

    // Apply limit
    const limited = filtered.slice(0, limit);

    return HttpResponse.json({
      success: true,
      data: limited,
      total: filtered.length,
      page: 1,
      limit,
      totalPages: Math.ceil(filtered.length / limit),
    });
  }),

  http.get('/api/reports/:id', ({ params }) => {
    const report = mockReports.find((r) => r.id === params.id);

    if (!report) {
      return HttpResponse.json({ success: false, message: 'Report not found' }, { status: 404 });
    }

    return HttpResponse.json({
      success: true,
      report,
      files: [],
    });
  }),

  http.patch('/api/reports/:id', async ({ params, request }) => {
    const report = mockReports.find((r) => r.id === params.id);
    const updates = (await request.json()) as Record<string, unknown>;

    if (!report) {
      return HttpResponse.json({ success: false, message: 'Report not found' }, { status: 404 });
    }

    return HttpResponse.json({
      success: true,
      report: { ...report, ...updates },
    });
  }),

  http.delete('/api/reports/:id', ({ params }) => {
    const report = mockReports.find((r) => r.id === params.id);

    if (!report) {
      return HttpResponse.json({ success: false, message: 'Report not found' }, { status: 404 });
    }

    return HttpResponse.json({ success: true });
  }),

  // Projects endpoints
  http.get('/api/projects', () => {
    return HttpResponse.json({
      success: true,
      projects: mockProjects,
    });
  }),

  http.post('/api/projects', async ({ request }) => {
    const body = (await request.json()) as { name: string };

    return HttpResponse.json({
      success: true,
      project: {
        id: 'project-new',
        name: body.name,
        apiKey: 'new-api-key-789',
        reportsCount: 0,
        isActive: true,
        position: mockProjects.length,
      },
    });
  }),

  http.post('/api/projects/:id/regenerate-key', ({ params }) => {
    const project = mockProjects.find((p) => p.id === params.id);

    if (!project) {
      return HttpResponse.json({ success: false, message: 'Project not found' }, { status: 404 });
    }

    return HttpResponse.json({
      success: true,
      project: { ...project, apiKey: 'regenerated-key-xyz' },
    });
  }),

  http.delete('/api/projects/:id', ({ params }) => {
    const project = mockProjects.find((p) => p.id === params.id);

    if (!project) {
      return HttpResponse.json({ success: false, message: 'Project not found' }, { status: 404 });
    }

    return HttpResponse.json({ success: true });
  }),

  // Users endpoints
  http.get('/api/users', () => {
    return HttpResponse.json({
      success: true,
      users: [
        { ...mockUsers.admin, isActive: true },
        { ...mockUsers.viewer, isActive: true },
        { ...mockUsers.pending, isActive: false },
      ],
    });
  }),

  http.post('/api/users', async ({ request }) => {
    const body = (await request.json()) as { email: string; name: string; role: string };

    return HttpResponse.json({
      success: true,
      user: {
        id: 'user-new',
        email: body.email,
        name: body.name,
        role: body.role,
        isActive: true,
      },
    });
  }),

  http.post('/api/users/invite', async ({ request }) => {
    const body = (await request.json()) as { email: string; name: string; role: string };

    return HttpResponse.json({
      success: true,
      user: {
        id: 'user-new',
        email: body.email,
        name: body.name,
        role: body.role,
        isActive: false,
        invitationSentAt: new Date().toISOString(),
      },
      message: 'Invitation sent successfully',
    });
  }),

  http.post('/api/users/:id/resend-invitation', ({ params }) => {
    return HttpResponse.json({
      success: true,
      user: {
        id: params.id,
        invitationSentAt: new Date().toISOString(),
      },
      message: 'Invitation resent successfully',
    });
  }),

  http.patch('/api/users/:id', async ({ params, request }) => {
    const updates = (await request.json()) as Record<string, unknown>;

    return HttpResponse.json({
      success: true,
      user: { id: params.id, ...updates },
    });
  }),

  http.delete('/api/users/:id', () => {
    return HttpResponse.json({ success: true });
  }),

  // Stats endpoints
  http.get('/api/stats/dashboard', () => {
    return HttpResponse.json({
      success: true,
      stats: mockStats,
    });
  }),

  http.get('/api/reports/stats/overview', () => {
    return HttpResponse.json({
      success: true,
      stats: mockStats,
    });
  }),

  // Settings endpoints
  http.get('/api/settings', () => {
    return HttpResponse.json({
      success: true,
      settings: {
        appName: 'BugPin',
        appUrl: 'https://bugpin.example.com',
        retentionDays: 90,
        rateLimitPerMinute: 10,
        sessionMaxAgeDays: 7,
        invitationExpirationDays: 7,
        smtpEnabled: false,
        smtpConfig: {
          host: '',
          port: 587,
          user: '',
          from: '',
        },
        s3Enabled: false,
        s3Config: {
          bucket: '',
          region: '',
          accessKeyId: '',
          secretAccessKey: '',
          endpoint: '',
        },
        widgetLauncherButton: {
          position: 'bottom-right' as const,
          buttonText: null,
          buttonShape: 'round' as const,
          buttonIcon: null,
          buttonIconSize: 24,
          buttonIconStroke: 2,
          theme: 'auto' as const,
          enableHoverScaleEffect: true,
          tooltipEnabled: false,
          tooltipText: null,
          lightButtonColor: '#02658D',
          lightTextColor: '#FFFFFF',
          lightButtonHoverColor: '#014A6B',
          lightTextHoverColor: '#FFFFFF',
          darkButtonColor: '#02658D',
          darkTextColor: '#FFFFFF',
          darkButtonHoverColor: '#03789E',
          darkTextHoverColor: '#FFFFFF',
        },
        widgetDialog: {
          lightButtonColor: '#02658D',
          lightTextColor: '#FFFFFF',
          lightButtonHoverColor: '#014A6B',
          lightTextHoverColor: '#FFFFFF',
          darkButtonColor: '#02658D',
          darkTextColor: '#FFFFFF',
          darkButtonHoverColor: '#03789E',
          darkTextHoverColor: '#FFFFFF',
        },
        screenshot: {
          useScreenCaptureAPI: false,
          maxScreenshotSize: 10,
        },
        notifications: {
          emailEnabled: false,
          notifyOnNewReport: true,
          notifyOnStatusChange: true,
          notifyOnPriorityChange: false,
          notifyOnAssignment: true,
        },
        branding: {
          primaryColor: '#02658D',
          logoLightUrl: null,
          logoDarkUrl: null,
          iconLightUrl: null,
          iconDarkUrl: null,
          faviconLightVersion: '/favicon-light.svg',
          faviconDarkVersion: '/favicon-dark.svg',
        },
        adminButton: {
          lightButtonColor: '#02658D',
          lightTextColor: '#FFFFFF',
          lightButtonHoverColor: '#014A6B',
          lightTextHoverColor: '#FFFFFF',
          darkButtonColor: '#02658D',
          darkTextColor: '#FFFFFF',
          darkButtonHoverColor: '#03789E',
          darkTextHoverColor: '#FFFFFF',
        },
      },
    });
  }),

  http.put('/api/settings', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    return HttpResponse.json({
      success: true,
      settings: body,
    });
  }),

  // Storage stats
  http.get('/api/storage/stats', () => {
    return HttpResponse.json({
      success: true,
      stats: {
        totalSize: 1024 * 1024 * 100, // 100 MB
        filesCount: 42,
        reportsCount: 15,
      },
    });
  }),

  // Password change
  http.post('/api/auth/change-password', async ({ request }) => {
    const body = (await request.json()) as { currentPassword: string; newPassword: string };

    if (body.currentPassword === 'wrongpassword') {
      return HttpResponse.json(
        { success: false, message: 'Current password is incorrect' },
        { status: 400 },
      );
    }

    return HttpResponse.json({ success: true });
  }),

  // License endpoints
  http.get('/api/license/features', () => {
    return HttpResponse.json({
      success: true,
      features: {
        's3-storage': true,
        'custom-branding': true,
        'webhooks': true,
        'api-access': true,
        'custom-email-templates': true,
        'white-label': true,
      },
    });
  }),

  // Integrations endpoints
  http.get('/api/integrations', ({ request }) => {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');

    if (!projectId) {
      return HttpResponse.json(
        { success: false, error: 'MISSING_PROJECT_ID', message: 'Project ID is required' },
        { status: 400 },
      );
    }

    return HttpResponse.json({
      success: true,
      data: mockIntegrations.filter((i) => i.projectId === projectId),
    });
  }),

  http.get('/api/integrations/:id', ({ params }) => {
    const integration = mockIntegrations.find((i) => i.id === params.id);

    if (!integration) {
      return HttpResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'Integration not found' },
        { status: 404 },
      );
    }

    return HttpResponse.json({
      success: true,
      integration,
    });
  }),

  http.post('/api/integrations/:id/sync-mode', async ({ request }) => {
    const body = (await request.json()) as { syncMode: 'manual' | 'automatic' };

    return HttpResponse.json({
      success: true,
      syncMode: body.syncMode,
      unsyncedCount: body.syncMode === 'automatic' ? 3 : 0,
    });
  }),

  http.get('/api/integrations/:id/sync-status', ({ params }) => {
    const integration = mockIntegrations.find((i) => i.id === params.id);

    if (!integration) {
      return HttpResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'Integration not found' },
        { status: 404 },
      );
    }

    return HttpResponse.json({
      success: true,
      syncMode: 'manual',
      unsyncedCount: 5,
      queueLength: 0,
      processing: false,
    });
  }),

  http.post('/api/integrations/:id/sync-existing', async ({ request }) => {
    const body = (await request.json()) as { reportIds: string[] | 'all' };
    const count = body.reportIds === 'all' ? 5 : body.reportIds.length;

    return HttpResponse.json({
      success: true,
      message: `Queued ${count} reports for sync`,
      queued: count,
    });
  }),

  http.post('/api/reports/:id/retry-sync', () => {
    return HttpResponse.json({
      success: true,
      message: 'Report queued for sync',
    });
  }),
];

// Mock integrations data
export const mockIntegrations = [
  {
    id: 'integration-1',
    projectId: 'project-1',
    type: 'github' as const,
    name: 'Main Repo',
    isActive: true,
    config: {
      owner: 'testorg',
      repo: 'testrepo',
      accessToken: '***',
      syncMode: 'manual' as const,
    },
    createdAt: '2024-01-10T10:00:00Z',
    updatedAt: '2024-01-10T10:00:00Z',
  },
  {
    id: 'integration-2',
    projectId: 'project-1',
    type: 'github' as const,
    name: 'Auto Sync Repo',
    isActive: true,
    config: {
      owner: 'testorg',
      repo: 'autorepo',
      accessToken: '***',
      syncMode: 'automatic' as const,
    },
    createdAt: '2024-01-12T10:00:00Z',
    updatedAt: '2024-01-12T10:00:00Z',
  },
];
