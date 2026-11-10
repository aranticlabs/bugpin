import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, screen, userEvent, waitFor, within } from '../utils';
import { UpdateBanner } from '../../components/UpdateBanner';
import { server } from '../mocks/server';
import { mockUsers } from '../mocks/handlers';

const RELEASE_URL = 'https://github.com/aranticlabs/bugpin/releases/tag/v1.0.7';
const PACKAGE_URL = 'https://www.npmjs.com/package/@arantic/bugpin-widget?activeTab=versions';

const STORAGE_KEY = 'bugpin.updateBanner.dismissedVersion';
const SNOOZE_KEY = 'bugpin.updateBanner.snoozedUntil';
const UPGRADE_GUIDE_URL = 'https://docs.bugpin.io/upgrading';
const WIDGET_STORAGE_KEY = 'bugpin.widgetPackageWarning.dismissedId';
const WIDGET_SNOOZE_KEY = 'bugpin.widgetPackageWarning.snoozedUntil';

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

function recordPreferenceUpdates(): Array<Record<string, unknown>> {
  const saved: Array<Record<string, unknown>> = [];
  server.use(
    http.patch('/api/user-preferences/me', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      saved.push(body);
      return HttpResponse.json({ success: true, preferences: body });
    })
  );
  return saved;
}

describe('UpdateBanner', () => {
  it.each([
    ['1.3.0', '2.0.0', '2.0'],
    ['1.3.0-beta.2', '2.0.0', '2.0'],
    ['9.9.0', '10.0.0', '10.0'],
  ])('shows the major notice from %s to %s', async (current, latest, label) => {
    mockUserRole('admin');
    const releaseUrl = `https://github.com/aranticlabs/bugpin/releases/tag/v${latest}`;
    mockVersion({ current, latest, releaseUrl });

    renderWithProviders(<UpdateBanner />);

    expect(await screen.findByText(`BugPin ${label} is available.`)).toBeInTheDocument();
    expect(screen.getByText(/This major release includes breaking changes/i)).toBeInTheDocument();
    expect(screen.getByText(/Back up your data before upgrading/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Upgrade guide/i })).toHaveAttribute(
      'href',
      UPGRADE_GUIDE_URL
    );
    expect(screen.getByRole('link', { name: /Release notes/i })).toHaveAttribute(
      'href',
      releaseUrl
    );
  });

  it.each([
    ['1.3.0', '1.4.0', '1.4'],
    ['2.0.0', '2.1.0', '2.1'],
    ['1.3.2', '1.4.0', '1.4'],
  ])('shows the minor notice from %s to %s', async (current, latest, label) => {
    mockUserRole('admin');
    mockVersion({ current, latest });

    renderWithProviders(<UpdateBanner />);

    expect(await screen.findByText(`BugPin ${label} is available.`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See what's new/i })).toHaveAttribute(
      'href',
      RELEASE_URL
    );
    expect(screen.queryByText(/breaking changes/i)).not.toBeInTheDocument();
  });

  it.each([
    ['1.3.0', '1.3.1'],
    ['1.3.0-beta.2', '1.3.0'],
  ])('shows the patch notice from %s to %s', async (current, latest) => {
    mockUserRole('admin');
    mockVersion({ current, latest });

    renderWithProviders(<UpdateBanner />);

    expect(
      await screen.findByText(new RegExp(`BugPin ${latest} is available`))
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Release notes/i })).toHaveAttribute(
      'href',
      RELEASE_URL
    );
    expect(screen.queryByText(/breaking changes/i)).not.toBeInTheDocument();
  });

  it('opens the release page in a new tab', async () => {
    mockUserRole('admin');
    mockVersion();

    renderWithProviders(<UpdateBanner />);

    const link = await screen.findByRole('link', { name: /Release notes/i });
    expect(link).toHaveAttribute('href', RELEASE_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('omits release links when the release URL is unknown', async () => {
    mockUserRole('admin');
    mockVersion({ current: '1.3.0', latest: '1.4.0', releaseUrl: null });

    renderWithProviders(<UpdateBanner />);

    expect(await screen.findByText('BugPin 1.4 is available.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
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

  it('hides the banner and stores the dismissed version in the user preferences', async () => {
    mockUserRole('admin');
    mockVersion();
    const saved = recordPreferenceUpdates();

    const user = userEvent.setup();
    renderWithProviders(<UpdateBanner />);

    await user.click(await screen.findByRole('button', { name: 'Dismiss update notification' }));

    await waitFor(() => {
      expect(screen.queryByText(/BugPin 1\.0\.7 is available/i)).not.toBeInTheDocument();
    });
    await waitFor(() => expect(saved).toContainEqual({ dismissedUpdateVersion: '1.0.7' }));
  });

  it.each([
    ['major', '1.3.0', '2.0.0', '2.1.0'],
    ['minor', '1.3.0', '1.4.0', '1.4.1'],
    ['patch', '1.0.6', '1.0.7', '1.0.7'],
  ])(
    'keeps a dismissed %s notice hidden within the same release line',
    async (_type, current, dismissed, latest) => {
      window.localStorage.setItem(STORAGE_KEY, dismissed);
      mockUserRole('admin');
      mockVersion({ current, latest });

      const { container } = renderWithProviders(<UpdateBanner />);

      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
    }
  );

  it.each([
    ['major', '1.3.0', '2.4.0', '3.0.0', 'BugPin 3.0 is available.'],
    ['minor', '1.3.0', '1.4.2', '1.5.0', 'BugPin 1.5 is available.'],
    ['patch', '1.0.6', '1.0.7', '1.0.8', /BugPin 1\.0\.8 is available/],
  ])(
    'shows the %s notice again for a new release line',
    async (_type, current, dismissed, latest, text) => {
      window.localStorage.setItem(STORAGE_KEY, dismissed);
      mockUserRole('admin');
      mockVersion({ current, latest });

      renderWithProviders(<UpdateBanner />);

      expect(await screen.findByText(text)).toBeInTheDocument();
    }
  );

  it('snoozes the notice for a day with Not now', async () => {
    mockUserRole('admin');
    mockVersion();

    const user = userEvent.setup();
    const before = Date.now();
    renderWithProviders(<UpdateBanner />);

    await user.click(await screen.findByRole('button', { name: 'Not now' }));

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
    const snoozedUntil = Number(window.localStorage.getItem(SNOOZE_KEY));
    expect(snoozedUntil).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('stays hidden while snoozed', async () => {
    window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + 60_000));
    mockUserRole('admin');
    mockVersion();

    const { container } = renderWithProviders(<UpdateBanner />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('shows the notice again after the snooze expires', async () => {
    window.localStorage.setItem(SNOOZE_KEY, String(Date.now() - 1));
    mockUserRole('admin');
    mockVersion();

    renderWithProviders(<UpdateBanner />);

    expect(await screen.findByText(/BugPin 1\.0\.7 is available/)).toBeInTheDocument();
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
    const saved = recordPreferenceUpdates();

    const user = userEvent.setup();
    renderWithProviders(<UpdateBanner />);

    const dismiss = await screen.findByRole('button', {
      name: /Dismiss widget package compatibility warning/i,
    });
    await user.click(dismiss);

    await waitFor(() => {
      expect(screen.queryByText(/widget version unsupported/i)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/BugPin 1\.0\.7 is available/i)).toBeInTheDocument();
    await waitFor(() => expect(saved).toContainEqual({ dismissedWidgetWarningId: 'warning_1' }));
    expect(saved.some((body) => 'dismissedUpdateVersion' in body)).toBe(false);
  });

  it('snoozes the widget warning for a day independently from the update notice', async () => {
    mockUserRole('admin');
    mockVersion({ widgetPackage: incompatibleWidgetPackage });

    const user = userEvent.setup();
    const before = Date.now();
    renderWithProviders(<UpdateBanner />);

    const warning = (await screen.findByText(/widget version unsupported/i)).closest(
      '[role="status"]'
    ) as HTMLElement;
    await user.click(within(warning).getByRole('button', { name: 'Not now' }));

    await waitFor(() => {
      expect(screen.queryByText(/widget version unsupported/i)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/BugPin 1\.0\.7 is available/i)).toBeInTheDocument();
    expect(Number(window.localStorage.getItem(WIDGET_SNOOZE_KEY))).toBeGreaterThanOrEqual(
      before + 24 * 60 * 60 * 1000
    );
    expect(window.localStorage.getItem(SNOOZE_KEY)).toBeNull();
    expect(window.localStorage.getItem(WIDGET_STORAGE_KEY)).toBeNull();
  });

  it('shows the widget warning again after its snooze expires', async () => {
    window.localStorage.setItem(WIDGET_SNOOZE_KEY, String(Date.now() - 1));
    mockUserRole('admin');
    mockVersion({ updateAvailable: false, widgetPackage: incompatibleWidgetPackage });

    renderWithProviders(<UpdateBanner />);

    expect(await screen.findByText(/widget version unsupported/i)).toBeInTheDocument();
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
    const saved = recordPreferenceUpdates();

    renderWithProviders(<UpdateBanner />);

    await waitFor(() => expect(saved).toContainEqual({ dismissedWidgetWarningId: null }));
    expect(window.localStorage.getItem(WIDGET_STORAGE_KEY)).toBeNull();
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
