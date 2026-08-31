import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, screen, userEvent, waitFor } from '../utils';
import { UpdateBanner } from '../../components/UpdateBanner';
import { server } from '../mocks/server';
import { mockUsers } from '../mocks/handlers';

const RELEASE_URL = 'https://github.com/aranticlabs/bugpin/releases/tag/v1.0.7';
const PACKAGE_URL = 'https://www.npmjs.com/package/@arantic/bugpin-widget?activeTab=versions';

const STORAGE_KEY = 'bugpin.updateBanner.dismissedVersion';
const WIDGET_STORAGE_KEY = 'bugpin.widgetPackageWarning.dismissedId';

interface WidgetPackageResponseBody {
  minimumSupportedVersion: string;
  incompatible: boolean;
  warningId: string | null;
  affectedProjects: Array<{
    projectId: string;
    projectName: string;
    observedVersions: string[];
    deploymentCount: number;
  }>;
}

interface VersionResponseBody {
  current?: string;
  latest?: string | null;
  updateAvailable?: boolean;
  releaseUrl?: string | null;
  publishedAt?: string | null;
  lastCheckedAt?: string | null;
  checkEnabled?: boolean;
  widgetPackage?: WidgetPackageResponseBody;
}

const cleanWidgetPackage: WidgetPackageResponseBody = {
  minimumSupportedVersion: '1.1.3',
  incompatible: false,
  warningId: null,
  affectedProjects: [],
};

const incompatibleWidgetPackage: WidgetPackageResponseBody = {
  minimumSupportedVersion: '1.1.3',
  incompatible: true,
  warningId: 'warning_1',
  affectedProjects: [
    {
      projectId: 'proj_checkout',
      projectName: 'Checkout',
      observedVersions: ['1.1.1', '1.1.2'],
      deploymentCount: 2,
    },
  ],
};

function mockVersion(overrides: VersionResponseBody = {}) {
  server.use(
    http.get('/api/version', () =>
      HttpResponse.json({
        success: true,
        current: '1.0.6',
        latest: '1.0.7',
        updateAvailable: true,
        releaseUrl: RELEASE_URL,
        publishedAt: '2026-04-22T10:14:00Z',
        lastCheckedAt: '2026-05-01T08:00:00Z',
        checkEnabled: true,
        widgetPackage: cleanWidgetPackage,
        ...overrides,
      })
    )
  );
}

function mockUserRole(role: 'admin' | 'editor' | 'viewer') {
  const user =
    role === 'admin' ? mockUsers.admin : role === 'editor' ? mockUsers.editor : mockUsers.viewer;
  server.use(
    http.get('/api/auth/me', () => HttpResponse.json({ success: true, authenticated: true, user }))
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('UpdateBanner', () => {
  it('renders for admins when an update is available', async () => {
    mockUserRole('admin');
    mockVersion();

    renderWithProviders(<UpdateBanner />);

    expect(await screen.findByText(/A new version of BugPin is available/i)).toBeInTheDocument();
    expect(screen.getByText('v1.0.7')).toBeInTheDocument();
  });

  it('opens the release page in a new tab', async () => {
    mockUserRole('admin');
    mockVersion();

    renderWithProviders(<UpdateBanner />);

    const link = await screen.findByRole('link', { name: /View release notes/i });
    expect(link).toHaveAttribute('href', RELEASE_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders nothing for viewers', async () => {
    mockUserRole('viewer');
    mockVersion();

    const { container } = renderWithProviders(<UpdateBanner />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('renders nothing for editors', async () => {
    mockUserRole('editor');
    mockVersion();

    const { container } = renderWithProviders(<UpdateBanner />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('renders nothing when updateAvailable is false', async () => {
    mockUserRole('admin');
    mockVersion({ updateAvailable: false });

    const { container } = renderWithProviders(<UpdateBanner />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('renders nothing when checkEnabled is false', async () => {
    mockUserRole('admin');
    mockVersion({ checkEnabled: false, updateAvailable: false, latest: null });

    const { container } = renderWithProviders(<UpdateBanner />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('hides the banner and stores the dismissed version in localStorage', async () => {
    mockUserRole('admin');
    mockVersion();

    const user = userEvent.setup();
    renderWithProviders(<UpdateBanner />);

    const dismiss = await screen.findByRole('button', { name: /Dismiss/i });
    await user.click(dismiss);

    await waitFor(() => {
      expect(screen.queryByText(/A new version of BugPin is available/i)).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1.0.7');
  });

  it('reappears when a newer version is published after dismissal', async () => {
    window.localStorage.setItem(STORAGE_KEY, '1.0.7');
    mockUserRole('admin');
    mockVersion({ latest: '1.0.8', releaseUrl: RELEASE_URL.replace('1.0.7', '1.0.8') });

    renderWithProviders(<UpdateBanner />);

    expect(await screen.findByText('v1.0.8')).toBeInTheDocument();
  });

  it('stays hidden when the stored dismissal matches the current latest', async () => {
    window.localStorage.setItem(STORAGE_KEY, '1.0.7');
    mockUserRole('admin');
    mockVersion();

    const { container } = renderWithProviders(<UpdateBanner />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('shows widget compatibility when remote update checks are disabled', async () => {
    mockUserRole('admin');
    mockVersion({
      checkEnabled: false,
      updateAvailable: false,
      latest: null,
      widgetPackage: incompatibleWidgetPackage,
    });

    renderWithProviders(<UpdateBanner />);

    expect(
      await screen.findByText(/1 project uses a widget version unsupported by this BugPin server/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/2 affected deployments/i)).toBeInTheDocument();
    expect(screen.getByText(/Checkout \(v1\.1\.1\)/i)).toBeInTheDocument();
  });

  it('shows at most three affected projects and links to package versions', async () => {
    mockUserRole('admin');
    mockVersion({
      updateAvailable: false,
      widgetPackage: {
        ...incompatibleWidgetPackage,
        affectedProjects: [
          incompatibleWidgetPackage.affectedProjects[0]!,
          {
            projectId: 'proj_portal',
            projectName: 'Customer Portal',
            observedVersions: ['1.0.9'],
            deploymentCount: 1,
          },
          {
            projectId: 'proj_docs',
            projectName: 'Docs',
            observedVersions: ['1.1.0'],
            deploymentCount: 1,
          },
          {
            projectId: 'proj_shop',
            projectName: 'Shop',
            observedVersions: ['1.1.2'],
            deploymentCount: 1,
          },
        ],
      },
    });

    const { container } = renderWithProviders(<UpdateBanner />);

    expect(await screen.findByText(/4 projects use/i)).toBeInTheDocument();
    expect(container.textContent).toContain('+1 more');
    expect(container.textContent).not.toContain('Shop (v1.1.2)');
    const link = screen.getByRole('link', { name: /View package versions/i });
    expect(link).toHaveAttribute('href', PACKAGE_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('dismisses the widget warning independently from the update notice', async () => {
    mockUserRole('admin');
    mockVersion({ widgetPackage: incompatibleWidgetPackage });

    const user = userEvent.setup();
    renderWithProviders(<UpdateBanner />);

    const dismiss = await screen.findByRole('button', {
      name: /Dismiss widget package compatibility warning/i,
    });
    await user.click(dismiss);

    await waitFor(() => {
      expect(screen.queryByText(/widget version unsupported/i)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/A new version of BugPin is available/i)).toBeInTheDocument();
    expect(window.localStorage.getItem(WIDGET_STORAGE_KEY)).toBe('warning_1');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('shows a changed widget warning after an earlier dismissal', async () => {
    window.localStorage.setItem(WIDGET_STORAGE_KEY, 'warning_1');
    mockUserRole('admin');
    mockVersion({
      updateAvailable: false,
      widgetPackage: { ...incompatibleWidgetPackage, warningId: 'warning_2' },
    });

    renderWithProviders(<UpdateBanner />);

    expect(await screen.findByText(/widget version unsupported/i)).toBeInTheDocument();
  });

  it('clears the widget dismissal when incompatibility is gone', async () => {
    window.localStorage.setItem(WIDGET_STORAGE_KEY, 'warning_1');
    mockUserRole('admin');
    mockVersion({ updateAvailable: false, widgetPackage: cleanWidgetPackage });

    renderWithProviders(<UpdateBanner />);

    await waitFor(() => {
      expect(window.localStorage.getItem(WIDGET_STORAGE_KEY)).toBeNull();
    });
  });

  it('does not request compatibility status for non-admin users', async () => {
    let versionRequests = 0;
    mockUserRole('viewer');
    server.use(
      http.get('/api/version', () => {
        versionRequests += 1;
        return HttpResponse.json({ success: true, widgetPackage: incompatibleWidgetPackage });
      })
    );

    const { container } = renderWithProviders(<UpdateBanner />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
    expect(versionRequests).toBe(0);
  });
});
