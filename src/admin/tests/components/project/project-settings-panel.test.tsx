import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { renderWithQuery, screen, userEvent, waitFor } from '../../utils';
import { UnsavedChangesBar, UnsavedChangesProvider } from '../../../components/UnsavedChangesGuard';
import {
  ProjectSettingsPanel,
  type ProjectSettingsSection,
} from '../../../components/project/ProjectSettingsPanel';
import type { Project, ProjectNotificationDefaults } from '@shared/types';
import { toast } from 'sonner';

const { mockGet, mockPatch, mockDelete, mockGetConfig } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPatch: vi.fn(),
  mockDelete: vi.fn(),
  mockGetConfig: vi.fn(),
}));

vi.mock('../../../api/client', () => ({
  api: {
    get: mockGet,
    patch: mockPatch,
    delete: mockDelete,
  },
}));

vi.mock('../../../api/branding', () => ({
  brandingApi: {
    getConfig: mockGetConfig,
  },
}));

vi.mock('../../../components/WidgetDialogSettingsForm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../components/WidgetDialogSettingsForm')>()),
  WidgetDialogSettingsForm: ({ disabled }: { disabled?: boolean }) => (
    <p data-disabled={disabled ? 'true' : 'false'}>Widget dialog fields</p>
  ),
}));

vi.mock('../../../components/WidgetLauncherButtonSettingsForm', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../components/WidgetLauncherButtonSettingsForm')
  >()),
  WidgetLauncherButtonSettingsForm: ({ disabled }: { disabled?: boolean }) => (
    <p data-disabled={disabled ? 'true' : 'false'}>Launcher button fields</p>
  ),
}));

vi.mock('../../../components/ScreenshotSettingsForm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../components/ScreenshotSettingsForm')>()),
  ScreenshotSettingsForm: ({ disabled }: { disabled?: boolean }) => (
    <p data-disabled={disabled ? 'true' : 'false'}>Screenshot fields</p>
  ),
}));

vi.mock('../../../components/RecordingSettingsForm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../components/RecordingSettingsForm')>()),
  RecordingSettingsForm: ({ disabled }: { disabled?: boolean }) => (
    <p data-disabled={disabled ? 'true' : 'false'}>Recording fields</p>
  ),
}));

vi.mock('../../../components/NotificationSettingsForm', () => ({
  NotificationSettingsForm: ({ disabled }: { disabled?: boolean }) => (
    <p data-disabled={disabled ? 'true' : 'false'}>Team notification fields</p>
  ),
}));

vi.mock('../../../components/project/ProjectWhitelistForm', () => ({
  ProjectWhitelistForm: ({ disabled }: { disabled?: boolean }) => (
    <p data-disabled={disabled ? 'true' : 'false'}>Allowed domain fields</p>
  ),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockToast = toast as unknown as { success: ReturnType<typeof vi.fn> };

const baseProject: Project = {
  id: 'project-1',
  name: 'Project',
  apiKey: 'api-key',
  reportsCount: 0,
  isActive: true,
  position: 0,
  settings: {
    widgetDialog: {
      lightButtonColor: '#111111',
      darkButtonColor: '#222222',
    },
    widgetLauncherButton: {
      position: 'bottom-right',
      buttonText: { en: 'Report' },
      buttonShape: 'round',
    },
    screenshot: {
      useScreenCaptureAPI: true,
      maxScreenshotSize: 5,
      maxImageUploadSizeMb: 10,
      maxVideoUploadSizeMb: 50,
      maxVideoUploadMbPerDay: 2048,
      enableScreenRecording: true,
      allowRecordingMicrophone: true,
      maxRecordingDurationSeconds: 120,
    },
    security: {
      allowedOrigins: ['example.com'],
    },
    defaultAssigneeUserId: 'user-2',
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const notificationDefaults: ProjectNotificationDefaults = {
  id: 'defaults-1',
  projectId: 'project-1',
  defaultEmailEnabled: true,
  defaultNotifyOnNewReport: true,
  defaultNotifyOnStatusChange: false,
  defaultNotifyOnPriorityChange: false,
  defaultNotifyOnAssignment: true,
  defaultNotifyOnDeletion: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function setupMockResponses(
  defaults: ProjectNotificationDefaults | null,
  euPrivacyMode = false,
  project: Project = baseProject
) {
  mockGet.mockImplementation((url: string) => {
    if (url === '/projects/project-1') {
      return Promise.resolve({ data: { project } });
    }
    if (url === '/settings') {
      return Promise.resolve({
        data: {
          settings: {
            widgetDialog: {},
            widgetLauncherButton: {},
            screenshot: {},
            privacy: { euPrivacyMode },
            diagnostics: {
              activityCapture: true,
              consoleCapture: true,
              networkCapture: false,
              storageKeysCapture: false,
            },
            language: { mode: 'manual', defaultLanguage: 'de' },
          },
        },
      });
    }
    if (url === '/users/assignable') {
      return Promise.resolve({
        data: {
          users: [
            { id: 'user-1', name: 'Admin User', email: 'admin@example.com' },
            { id: 'user-2', name: 'Editor User', email: 'editor@example.com' },
          ],
        },
      });
    }
    if (url === '/notification-preferences/projects/project-1/defaults') {
      return Promise.resolve({ data: { defaults } });
    }
    return Promise.resolve({ data: {} });
  });

  mockGetConfig.mockResolvedValue({ widgetPrimaryColors: {} });
  mockPatch.mockResolvedValue({ data: { success: true } });
  mockDelete.mockResolvedValue({ data: { success: true } });
}

const SECTIONS: ProjectSettingsSection[] = [
  'general',
  'launcher',
  'dialog',
  'language',
  'capture',
  'notifications',
];

function PanelPage({ initial }: { initial: ProjectSettingsSection }) {
  const [section, setSection] = useState<ProjectSettingsSection>(initial);
  return (
    <>
      {SECTIONS.map((item) => (
        <button key={item} type="button" onClick={() => setSection(item)}>
          {`Show ${item}`}
        </button>
      ))}
      <Link to="/elsewhere">Leave page</Link>
      <Link to="/?tab=reports">Switch tab</Link>
      <ProjectSettingsPanel projectId="project-1" section={section} />
    </>
  );
}

function Harness({ initial = 'general' }: { initial?: ProjectSettingsSection }) {
  const [router] = useState(() =>
    createMemoryRouter([
      {
        path: '/',
        element: (
          <UnsavedChangesProvider>
            <PanelPage initial={initial} />
            <UnsavedChangesBar />
          </UnsavedChangesProvider>
        ),
      },
      { path: '/elsewhere', element: <p>Elsewhere page</p> },
    ])
  );
  return <RouterProvider router={router} />;
}

async function makeUnsavedChange(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('switch', { name: /use custom diagnostics settings/i }));
  await user.click(screen.getByRole('switch', { name: 'Network failures' }));
}

describe('ProjectSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves project settings and notification defaults', async () => {
    setupMockResponses(notificationDefaults);
    const user = userEvent.setup();

    renderWithQuery(<Harness />);

    await screen.findByRole('combobox', { name: /default assignee/i });
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show capture' }));
    await user.click(
      await screen.findByRole('switch', { name: /use custom diagnostics settings/i })
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/projects/project-1', {
        settings: expect.objectContaining({
          defaultAssigneeUserId: 'user-2',
          widgetDialog: baseProject.settings?.widgetDialog,
          widgetLauncherButton: baseProject.settings?.widgetLauncherButton,
          screenshot: baseProject.settings?.screenshot,
          security: baseProject.settings?.security,
        }),
      });
    });

    expect(mockPatch).toHaveBeenCalledWith(
      '/notification-preferences/projects/project-1/defaults',
      {
        defaultEmailEnabled: true,
        defaultNotifyOnNewReport: true,
        defaultNotifyOnStatusChange: false,
        defaultNotifyOnPriorityChange: false,
        defaultNotifyOnAssignment: true,
        defaultNotifyOnDeletion: true,
      }
    );

    expect(mockToast.success).toHaveBeenCalled();
  });

  it('saves project diagnostic restrictions', async () => {
    setupMockResponses(notificationDefaults);
    const user = userEvent.setup();

    renderWithQuery(<Harness initial="capture" />);

    const networkSwitch = await screen.findByRole('switch', { name: 'Network failures' });
    const storageSwitch = screen.getByRole('switch', { name: 'Storage key names' });
    expect(networkSwitch).toBeDisabled();
    expect(networkSwitch).toHaveAttribute('data-state', 'unchecked');

    await user.click(screen.getByRole('switch', { name: /use custom diagnostics settings/i }));
    expect(networkSwitch).toBeEnabled();
    await user.click(networkSwitch);
    await user.click(storageSwitch);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/projects/project-1', {
        settings: expect.objectContaining({
          activityCapture: true,
          consoleCapture: true,
          networkCapture: true,
          storageKeysCapture: true,
        }),
      });
    });
  });

  it('keeps unsaved edits when switching sections before saving', async () => {
    setupMockResponses(notificationDefaults);
    const user = userEvent.setup();

    renderWithQuery(<Harness initial="capture" />);

    await user.click(
      await screen.findByRole('switch', { name: /use custom diagnostics settings/i })
    );
    await user.click(screen.getByRole('switch', { name: 'Network failures' }));
    await user.click(screen.getByRole('button', { name: 'Show general' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/projects/project-1', {
        settings: expect.objectContaining({ networkCapture: true }),
      });
    });
  });

  it('disables the project activity control in EU Privacy Mode', async () => {
    setupMockResponses(notificationDefaults, true);

    renderWithQuery(<Harness initial="capture" />);

    const activitySwitch = await screen.findByRole('switch', { name: 'User activity trail' });
    expect(activitySwitch).toBeDisabled();
    expect(activitySwitch).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByText(/disabled for every project by EU Privacy Mode/i)).toBeInTheDocument();
  });

  it('badges and disables only inherited sections', async () => {
    setupMockResponses(notificationDefaults);
    const user = userEvent.setup();

    renderWithQuery(<Harness initial="capture" />);

    expect(await screen.findAllByText('Inherited')).toHaveLength(1);
    expect(screen.getByText('Recording fields')).toHaveAttribute('data-disabled', 'false');

    await user.click(screen.getByRole('switch', { name: /use custom recording settings/i }));

    expect(screen.getAllByText('Inherited')).toHaveLength(2);
    expect(screen.getByText('Recording fields')).toHaveAttribute('data-disabled', 'true');
  });

  it('clears custom settings and deletes notification defaults when disabled', async () => {
    setupMockResponses(null);
    const user = userEvent.setup();

    renderWithQuery(<Harness />);

    await screen.findByRole('combobox', { name: /default assignee/i });

    await user.click(screen.getByRole('button', { name: 'Show dialog' }));
    await user.click(screen.getByRole('switch', { name: /use custom dialog colors/i }));
    const dialogDefaultsLinks = screen.getAllByRole('link', { name: 'Edit project defaults' });
    expect(dialogDefaultsLinks).toHaveLength(2);
    for (const link of dialogDefaultsLinks) {
      expect(link).toHaveAttribute('href', '/settings/project-defaults/dialog');
    }

    await user.click(screen.getByRole('button', { name: 'Show launcher' }));
    await user.click(screen.getByRole('switch', { name: /use custom launcher button settings/i }));
    expect(screen.getByText('Launcher button fields')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByRole('link', { name: 'Edit project defaults' })).toHaveAttribute(
      'href',
      '/settings/project-defaults/launcher-button'
    );

    await user.click(screen.getByRole('button', { name: 'Show capture' }));
    await user.click(screen.getByRole('switch', { name: /use custom screenshot settings/i }));
    await user.click(screen.getByRole('switch', { name: /use custom recording settings/i }));

    await user.click(screen.getByRole('button', { name: 'Show general' }));
    expect(screen.getByText('Allowed domain fields')).toHaveAttribute('data-disabled', 'false');
    expect(
      screen.queryByRole('switch', { name: /use custom allowed domains/i })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show notifications' }));
    expect(
      screen.getByRole('switch', { name: /use custom notification settings/i })
    ).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByText('Team notification fields')).toHaveAttribute('data-disabled', 'true');
    // Each Custom switch saved by itself when it was turned off, so nothing is left unsaved.
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/projects/project-1', {
        settings: expect.objectContaining({
          widgetDialog: null,
          widgetLauncherButton: null,
          screenshot: null,
          security: baseProject.settings?.security,
        }),
      });
    });

    expect(mockDelete).toHaveBeenCalledWith(
      '/notification-preferences/projects/project-1/defaults'
    );
  });

  it('updates the default assignee', async () => {
    setupMockResponses(notificationDefaults);
    const user = userEvent.setup();

    renderWithQuery(<Harness />);

    await screen.findByRole('combobox', { name: /default assignee/i });

    await user.click(screen.getByRole('button', { name: 'Show general' }));
    await user.click(screen.getByRole('combobox', { name: /default assignee/i }));
    await user.click(await screen.findByText('Admin User'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/projects/project-1', {
        settings: expect.objectContaining({
          defaultAssigneeUserId: 'user-1',
        }),
      });
    });
  });

  it('keeps a project without language override inheriting the global language', async () => {
    setupMockResponses(notificationDefaults);
    const user = userEvent.setup();

    renderWithQuery(<Harness initial="language" />);

    const customSwitch = await screen.findByRole('switch', {
      name: /use custom language settings/i,
    });
    expect(customSwitch).toHaveAttribute('data-state', 'unchecked');
    const languageSelect = screen.getByRole('combobox', { name: /default language/i });
    expect(languageSelect).toBeDisabled();
    expect(languageSelect).toHaveTextContent('Deutsch');
    expect(screen.getByRole('radio', { name: 'Manual (locked)' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();

    // Turning Custom back off saves by itself, without a language override.
    await user.click(customSwitch);
    await user.click(customSwitch);

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/projects/project-1', {
        settings: expect.objectContaining({ language: null }),
      });
    });
  });

  it('clears an existing language override when custom settings are disabled', async () => {
    setupMockResponses(notificationDefaults, false, {
      ...baseProject,
      settings: { ...baseProject.settings, language: { mode: 'auto', defaultLanguage: 'fr' } },
    });
    const user = userEvent.setup();

    renderWithQuery(<Harness initial="language" />);

    const customSwitch = await screen.findByRole('switch', {
      name: /use custom language settings/i,
    });
    expect(customSwitch).toHaveAttribute('data-state', 'checked');
    expect(screen.getByRole('combobox', { name: /default language/i })).toHaveTextContent(
      'Français'
    );

    // Turning Custom off saves by itself.
    await user.click(customSwitch);

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/projects/project-1', {
        settings: expect.objectContaining({ language: null }),
      });
    });
  });

  it('starts a new language override from the global language', async () => {
    setupMockResponses(notificationDefaults);
    const user = userEvent.setup();

    renderWithQuery(<Harness initial="language" />);

    await user.click(await screen.findByRole('switch', { name: /use custom language settings/i }));
    expect(screen.getByRole('combobox', { name: /default language/i })).toHaveTextContent(
      'Deutsch'
    );

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/projects/project-1', {
        settings: expect.objectContaining({
          language: { mode: 'manual', defaultLanguage: 'de' },
        }),
      });
    });
  });

  it('copies the inherited capture values when a project switches to custom settings', async () => {
    setupMockResponses(notificationDefaults, false, {
      ...baseProject,
      settings: { ...baseProject.settings, screenshot: undefined },
    });
    const user = userEvent.setup();

    renderWithQuery(<Harness initial="capture" />);

    expect(await screen.findAllByRole('link', { name: 'Edit project defaults' })).toHaveLength(3);
    await user.click(screen.getByRole('switch', { name: /use custom screenshot settings/i }));
    expect(screen.getByText('Screenshot fields')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/projects/project-1', {
        settings: expect.objectContaining({
          screenshot: {
            useScreenCaptureAPI: false,
            maxScreenshotSize: 10,
            maxImageUploadSizeMb: 10,
          },
        }),
      });
    });
  });

  it('gives the launcher button and the dialog colors their own tab and preview', async () => {
    setupMockResponses(notificationDefaults);
    const user = userEvent.setup();

    renderWithQuery(<Harness initial="launcher" />);

    expect(await screen.findByText('Live Preview')).toBeInTheDocument();
    expect(screen.getByText('Launcher button fields')).toBeInTheDocument();
    expect(screen.queryByLabelText('Dialog preview')).not.toBeInTheDocument();
    expect(screen.queryByText('Widget dialog fields')).not.toBeInTheDocument();
    expect(screen.getByText('Launcher button fields')).toHaveAttribute('data-disabled', 'false');

    await user.click(screen.getByRole('button', { name: 'Show dialog' }));
    expect(screen.getByLabelText('Dialog preview')).toBeInTheDocument();
    expect(screen.getByText('Widget dialog fields')).toBeInTheDocument();
    expect(screen.queryByText('Launcher button fields')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Dark' })).not.toBeInTheDocument();
  });

  it('returns a project to the instance diagnostics when Custom is turned off', async () => {
    setupMockResponses(notificationDefaults, false, {
      ...baseProject,
      settings: { ...baseProject.settings, networkCapture: true, storageKeysCapture: true },
    });
    const user = userEvent.setup();

    renderWithQuery(<Harness initial="capture" />);

    const customSwitch = await screen.findByRole('switch', {
      name: /use custom diagnostics settings/i,
    });
    expect(customSwitch).toHaveAttribute('data-state', 'checked');
    expect(screen.getByRole('switch', { name: 'Network failures' })).toHaveAttribute(
      'data-state',
      'checked'
    );

    await user.click(customSwitch);
    const networkSwitch = screen.getByRole('switch', { name: 'Network failures' });
    expect(networkSwitch).toBeDisabled();
    expect(networkSwitch).toHaveAttribute('data-state', 'unchecked');

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/projects/project-1', {
        settings: expect.objectContaining({
          activityCapture: null,
          consoleCapture: null,
          networkCapture: null,
          storageKeysCapture: null,
        }),
      });
    });
  });
  it('leaves without asking when nothing changed', async () => {
    setupMockResponses(notificationDefaults);
    const user = userEvent.setup();

    renderWithQuery(<Harness initial="capture" />);

    await screen.findByRole('switch', { name: /use custom diagnostics settings/i });
    await user.click(screen.getByRole('link', { name: 'Leave page' }));

    expect(await screen.findByText('Elsewhere page')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('keeps unsaved changes without asking when only the tab changes', async () => {
    setupMockResponses(notificationDefaults);
    const user = userEvent.setup();

    renderWithQuery(<Harness initial="capture" />);

    await makeUnsavedChange(user);
    await user.click(screen.getByRole('link', { name: 'Switch tab' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Network failures' })).toHaveAttribute(
      'data-state',
      'checked'
    );
  });

  it('stays on the page when leaving with unsaved changes is canceled', async () => {
    setupMockResponses(notificationDefaults);
    const user = userEvent.setup();

    renderWithQuery(<Harness initial="capture" />);

    await makeUnsavedChange(user);
    await user.click(screen.getByRole('link', { name: 'Leave page' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Unsaved changes');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.queryByText('Elsewhere page')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Network failures' })).toHaveAttribute(
      'data-state',
      'checked'
    );
  });

  it('discards unsaved changes when leaving', async () => {
    setupMockResponses(notificationDefaults);
    const user = userEvent.setup();

    renderWithQuery(<Harness initial="capture" />);

    await makeUnsavedChange(user);
    await user.click(screen.getByRole('link', { name: 'Leave page' }));
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));

    expect(await screen.findByText('Elsewhere page')).toBeInTheDocument();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('saves unsaved changes before leaving', async () => {
    setupMockResponses(notificationDefaults);
    const user = userEvent.setup();

    renderWithQuery(<Harness initial="capture" />);

    await makeUnsavedChange(user);
    await user.click(screen.getByRole('link', { name: 'Leave page' }));
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Elsewhere page')).toBeInTheDocument();
    expect(mockPatch).toHaveBeenCalledWith('/projects/project-1', {
      settings: expect.objectContaining({ networkCapture: true }),
    });
  });
});
