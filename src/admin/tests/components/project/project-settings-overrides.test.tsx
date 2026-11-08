import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { renderWithQueryAndRouter, screen, userEvent, waitFor, within } from '../../utils';
import {
  ProjectSettingsPanel,
  type ProjectSettingsSection,
} from '../../../components/project/ProjectSettingsPanel';
import type { Project, ProjectNotificationDefaults, ProjectSettings } from '@shared/types';

const overrides: ProjectSettings = {
  widgetDialog: { lightButtonColor: '#111111' },
  widgetDialogContent: { showPriority: false },
  widgetLauncherButton: { position: 'bottom-left' },
  screenshot: { maxScreenshotSize: 5, enableScreenRecording: true },
  activityCapture: false,
  consoleCapture: true,
  networkCapture: true,
  storageKeysCapture: false,
  security: { allowedOrigins: ['example.com'] },
  reporterNotifications: { emailEnabled: true },
};

const OVERRIDE_KEYS = [
  'widgetDialog',
  'widgetDialogContent',
  'widgetLauncherButton',
  'screenshot',
  'activityCapture',
  'consoleCapture',
  'networkCapture',
  'storageKeysCapture',
  'security',
  'reporterNotifications',
] as const;

const notificationDefaults: ProjectNotificationDefaults = {
  id: 'defaults-1',
  projectId: 'project-1',
  defaultEmailEnabled: true,
  defaultNotifyOnNewReport: true,
  defaultNotifyOnStatusChange: false,
  defaultNotifyOnPriorityChange: false,
  defaultNotifyOnAssignment: true,
  defaultNotifyOnDeletion: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeProject(settings: ProjectSettings): Project {
  return {
    id: 'project-1',
    name: 'Project',
    apiKey: 'api-key',
    reportsCount: 0,
    isActive: true,
    position: 0,
    settings,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

let storedProject: Project;
let patchBodies: unknown[];

function mockServer(settings: ProjectSettings, defaults: ProjectNotificationDefaults | null) {
  storedProject = makeProject(settings);
  server.use(
    http.get('/api/projects/:id', () =>
      HttpResponse.json({ success: true, project: storedProject })
    ),
    http.patch('/api/projects/:id', async ({ request }) => {
      patchBodies.push(await request.json());
      return HttpResponse.json({ success: true, project: storedProject });
    }),
    http.get('/api/notification-preferences/projects/:id/defaults', () =>
      HttpResponse.json({ success: true, defaults })
    ),
    http.patch('/api/notification-preferences/projects/:id/defaults', () =>
      HttpResponse.json({ success: true })
    ),
    http.delete('/api/notification-preferences/projects/:id/defaults', () =>
      HttpResponse.json({ success: true })
    )
  );
}

function lastPatchBody() {
  return patchBodies[patchBodies.length - 1];
}

function renderPanel(section: ProjectSettingsSection) {
  return renderWithQueryAndRouter(<ProjectSettingsPanel projectId="project-1" section={section} />);
}

describe('ProjectSettingsPanel overrides', () => {
  beforeEach(() => {
    patchBodies = [];
  });

  it.each<{
    section: ProjectSettingsSection;
    switches: RegExp[];
    cleared: (typeof OVERRIDE_KEYS)[number][];
  }>([
    {
      section: 'dialog',
      switches: [/use custom dialog colors/i],
      cleared: ['widgetDialog'],
    },
    {
      section: 'dialog',
      switches: [/use custom dialog texts and fields/i],
      cleared: ['widgetDialogContent'],
    },
    {
      section: 'launcher',
      switches: [/use custom launcher button settings/i],
      cleared: ['widgetLauncherButton'],
    },
    {
      section: 'capture',
      switches: [/use custom screenshot settings/i, /use custom recording settings/i],
      cleared: ['screenshot'],
    },
    {
      section: 'capture',
      switches: [/use custom diagnostics settings/i],
      cleared: ['activityCapture', 'consoleCapture', 'networkCapture', 'storageKeysCapture'],
    },
    {
      section: 'notifications',
      switches: [/use custom notification settings/i],
      cleared: ['reporterNotifications'],
    },
  ])(
    'sends null for $cleared when Custom is turned off',
    async ({ section, switches, cleared }) => {
      mockServer(overrides, notificationDefaults);
      const user = userEvent.setup();

      renderPanel(section);

      for (const name of switches) {
        const saves = patchBodies.length + 1;
        await user.click(await screen.findByRole('switch', { name }));
        await waitFor(() => expect(patchBodies).toHaveLength(saves));
      }

      const body = lastPatchBody();
      for (const key of OVERRIDE_KEYS) {
        if (cleared.includes(key)) {
          expect(body).toHaveProperty(['settings', key], null);
        } else {
          expect(body).toHaveProperty(['settings', key], overrides[key]);
        }
      }
    }
  );

  it('sends null for the allowed domains when the last domain is removed', async () => {
    mockServer(overrides, notificationDefaults);
    const user = userEvent.setup();

    renderPanel('general');

    const domainRow = (await screen.findByText('example.com')).parentElement;
    if (!domainRow) throw new Error('Domain row not found');
    await user.click(within(domainRow).getByRole('button'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(lastPatchBody()).toHaveProperty(['settings', 'security'], null);
    expect(lastPatchBody()).toHaveProperty(
      ['settings', 'widgetLauncherButton'],
      overrides.widgetLauncherButton
    );
  });

  it('sends a new override and null for the overrides that stay off', async () => {
    mockServer({}, null);
    const user = userEvent.setup();

    renderPanel('capture');

    await user.click(
      await screen.findByRole('switch', { name: /use custom screenshot settings/i })
    );
    await user.click(screen.getByRole('switch', { name: /use custom diagnostics settings/i }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(patchBodies).toHaveLength(1));
    const body = lastPatchBody();
    expect(body).toHaveProperty(['settings', 'screenshot'], {
      useScreenCaptureAPI: false,
      maxScreenshotSize: 5,
      maxImageUploadSizeMb: 10,
    });
    expect(body).toHaveProperty(['settings', 'activityCapture'], true);
    expect(body).toHaveProperty(['settings', 'networkCapture'], true);
    for (const key of [
      'widgetDialog',
      'widgetDialogContent',
      'widgetLauncherButton',
      'security',
      'reporterNotifications',
    ]) {
      expect(body).toHaveProperty(['settings', key], null);
    }
  });

  it('keeps unsaved edits when the project is refetched', async () => {
    mockServer(overrides, notificationDefaults);
    const user = userEvent.setup();

    const { queryClient } = renderPanel('capture');

    const networkSwitch = await screen.findByRole('switch', { name: 'Network failures' });
    expect(networkSwitch).toHaveAttribute('data-state', 'checked');
    await user.click(networkSwitch);

    storedProject = makeProject({ ...overrides, widgetLauncherButton: { position: 'top-left' } });
    await queryClient.refetchQueries({ queryKey: ['project', 'project-1'] });

    expect(screen.getByRole('switch', { name: 'Network failures' })).toHaveAttribute(
      'data-state',
      'unchecked'
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(lastPatchBody()).toHaveProperty(['settings', 'networkCapture'], false);
    expect(lastPatchBody()).toHaveProperty(['settings', 'widgetLauncherButton'], {
      position: 'top-left',
    });
  });
});
