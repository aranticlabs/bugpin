import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { renderWithProviders, screen, userEvent, waitFor } from '../../utils';
import { MyNotificationsCard } from '../../../components/profile/MyNotificationsCard';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const preferences = (projectId: string, overrides: Record<string, boolean>) => ({
  id: `pref-${projectId}`,
  userId: 'user-1',
  projectId,
  emailEnabled: true,
  notifyOnNewReport: true,
  notifyOnStatusChange: true,
  notifyOnPriorityChange: true,
  notifyOnAssignment: true,
  notifyOnDeletion: true,
  notifyOnReporterReply: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const defaults = {
  emailEnabled: true,
  notifyOnNewReport: true,
  notifyOnStatusChange: true,
  notifyOnPriorityChange: true,
  notifyOnAssignment: true,
  notifyOnDeletion: false,
  notifyOnReporterReply: true,
};

let bulkPatches: Record<string, unknown>[] = [];

beforeEach(() => {
  bulkPatches = [];
  server.use(
    http.get('/api/notification-preferences/me', () =>
      HttpResponse.json({
        success: true,
        preferences: [
          preferences('project-1', { notifyOnStatusChange: false }),
          preferences('project-2', { notifyOnPriorityChange: false }),
        ],
        defaults,
      })
    ),
    http.patch('/api/notification-preferences/me/all-projects', async ({ request }) => {
      bulkPatches.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json({ success: true });
    })
  );
});

describe('MyNotificationsCard', () => {
  it('saves the reporter-reply preference independently', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MyNotificationsCard />);
    await user.click(await screen.findByRole('switch', { name: 'Reporter replies' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(bulkPatches).toEqual([{ notifyOnReporterReply: false }]));
  });

  it('shows a notification on only when every project has it on', async () => {
    renderWithProviders(<MyNotificationsCard />);

    expect(await screen.findByRole('switch', { name: 'New Reports' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Status Changes' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Priority Changes' })).not.toBeChecked();
  });

  it('shows the global defaults to a user without stored preferences or settings access', async () => {
    server.use(
      http.get('/api/notification-preferences/me', () =>
        HttpResponse.json({ success: true, preferences: [], defaults })
      ),
      http.get('/api/settings', () =>
        HttpResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
      )
    );
    renderWithProviders(<MyNotificationsCard />);

    expect(await screen.findByRole('switch', { name: 'New Reports' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Deletions' })).not.toBeChecked();
  });

  it('saves only the changed fields for all projects', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MyNotificationsCard />);

    await user.click(await screen.findByRole('switch', { name: 'New Reports' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(bulkPatches).toEqual([{ notifyOnNewReport: false }]));
  });

  it('saves only the email switch when it is turned off', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MyNotificationsCard />);

    await user.click(await screen.findByRole('switch', { name: 'New Reports' }));
    await user.click(screen.getByRole('switch', { name: 'Email Notifications' }));

    await waitFor(() => expect(bulkPatches).toEqual([{ emailEnabled: false }]));
  });
});
