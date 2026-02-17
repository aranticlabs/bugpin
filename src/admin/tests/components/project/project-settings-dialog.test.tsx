import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithQuery, screen, userEvent, waitFor } from '../../utils';
import { ProjectSettingsDialog } from '../../../components/project/ProjectSettingsDialog';
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

vi.mock('../../../components/WidgetDialogSettingsForm', () => ({
  WidgetDialogSettingsForm: ({
    onCustomToggle,
  }: {
    onCustomToggle?: (enabled: boolean) => void;
  }) => (
    <button type="button" onClick={() => onCustomToggle?.(false)}>
      Disable Widget Dialog
    </button>
  ),
}));

vi.mock('../../../components/WidgetLauncherButtonSettingsForm', () => ({
  WidgetLauncherButtonSettingsForm: ({
    onCustomToggle,
  }: {
    onCustomToggle?: (enabled: boolean) => void;
  }) => (
    <button type="button" onClick={() => onCustomToggle?.(false)}>
      Disable Widget Button
    </button>
  ),
}));

vi.mock('../../../components/ScreenshotSettingsForm', () => ({
  ScreenshotSettingsForm: ({ onCustomToggle }: { onCustomToggle?: (enabled: boolean) => void }) => (
    <button type="button" onClick={() => onCustomToggle?.(false)}>
      Disable Screenshot
    </button>
  ),
}));

vi.mock('../../../components/NotificationSettingsForm', () => ({
  NotificationSettingsForm: ({
    onCustomToggle,
  }: {
    onCustomToggle?: (enabled: boolean) => void;
  }) => (
    <button type="button" onClick={() => onCustomToggle?.(false)}>
      Disable Notifications
    </button>
  ),
}));

vi.mock('../../../components/project/ProjectWhitelistForm', () => ({
  ProjectWhitelistForm: ({
    onCustomToggle,
    onChange,
  }: {
    onCustomToggle?: (enabled: boolean) => void;
    onChange: (value: string[]) => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        onCustomToggle?.(false);
        onChange([]);
      }}
    >
      Disable Whitelist
    </button>
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
      buttonText: 'Report',
      buttonShape: 'round',
    },
    screenshot: {
      useScreenCaptureAPI: true,
      maxScreenshotSize: 5,
    },
    security: {
      allowedOrigins: ['example.com'],
    },
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
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function setupMockResponses(defaults: ProjectNotificationDefaults | null) {
  mockGet.mockImplementation((url: string) => {
    if (url === '/projects/project-1') {
      return Promise.resolve({ data: { project: baseProject } });
    }
    if (url === '/settings') {
      return Promise.resolve({
        data: { settings: { widgetDialog: {}, widgetLauncherButton: {}, screenshot: {} } },
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

describe('ProjectSettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves project settings and notification defaults', async () => {
    setupMockResponses(notificationDefaults);
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    renderWithQuery(
      <ProjectSettingsDialog
        project={{ id: 'project-1', name: 'Project' }}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    await screen.findByRole('tab', { name: /widget dialog/i });

    await user.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/projects/project-1', {
        settings: expect.objectContaining({
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
      },
    );

    expect(mockToast.success).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('clears custom settings and deletes notification defaults when disabled', async () => {
    setupMockResponses(null);
    const user = userEvent.setup();

    renderWithQuery(
      <ProjectSettingsDialog
        project={{ id: 'project-1', name: 'Project' }}
        open={true}
        onOpenChange={() => undefined}
      />,
    );

    await screen.findByRole('tab', { name: /widget dialog/i });

    await user.click(screen.getByRole('button', { name: /disable widget dialog/i }));

    await user.click(screen.getByRole('tab', { name: /widget button/i }));
    await user.click(screen.getByRole('button', { name: /disable widget button/i }));

    await user.click(screen.getByRole('tab', { name: /screenshot/i }));
    await user.click(screen.getByRole('button', { name: /disable screenshot/i }));

    await user.click(screen.getByRole('tab', { name: /whitelists/i }));
    await user.click(screen.getByRole('button', { name: /disable whitelist/i }));

    await user.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/projects/project-1', {
        settings: expect.objectContaining({
          widgetDialog: undefined,
          widgetLauncherButton: undefined,
          screenshot: undefined,
          security: undefined,
        }),
      });
    });

    expect(mockDelete).toHaveBeenCalledWith(
      '/notification-preferences/projects/project-1/defaults',
    );
  });
});
