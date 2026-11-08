import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { mockUsers } from '../../mocks/handlers';
import { renderWithProviders, screen, userEvent, waitFor, within } from '../../utils';
import { Users } from '../../../pages/console/Users';
import { api } from '../../../api/client';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

interface RecordedPatch {
  path: string;
  body: Record<string, unknown>;
}

let patches: RecordedPatch[] = [];

function recordPatches(respond?: () => Promise<Response> | Response) {
  server.use(
    http.patch('/api/users/:id', async ({ request }) => {
      patches.push({
        path: new URL(request.url).pathname,
        body: (await request.json()) as Record<string, unknown>,
      });
      return respond ? respond() : HttpResponse.json({ success: true });
    })
  );
}

async function findViewerRow() {
  const viewerEmail = await screen.findByText('viewer@example.com');
  const row = viewerEmail.closest('tr');
  if (!row) throw new Error('Viewer row not found');
  return row;
}

beforeEach(() => {
  patches = [];
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('Users', () => {
  it('invites a user from the modal', async () => {
    const user = userEvent.setup();
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithProviders(<Users />);

    await screen.findByText('Users');

    await user.click(screen.getByRole('button', { name: /invite user/i }));

    await user.type(screen.getByLabelText(/name/i), 'New User');
    await user.type(screen.getByLabelText(/email/i), 'newuser@example.com');

    await user.click(screen.getByRole('button', { name: /send invitation/i }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/users/invite',
        expect.objectContaining({
          name: 'New User',
          email: 'newuser@example.com',
          role: 'viewer',
        })
      );
      expect(toast.success).toHaveBeenCalled();
    });
  });

  it('labels the role select of the invite dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Users />);

    await user.click(await screen.findByRole('button', { name: /invite user/i }));

    expect(screen.getByRole('combobox', { name: 'Role' })).toBeInTheDocument();
  });

  it('deactivates a user only after confirmation', async () => {
    const user = userEvent.setup();
    recordPatches();
    renderWithProviders(<Users />);

    const row = await findViewerRow();
    await user.click(within(row).getByRole('button', { name: /deactivate viewer user/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Deactivate user');
    expect(patches).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));

    await waitFor(() =>
      expect(patches).toEqual([{ path: '/api/users/user-3', body: { isActive: false } }])
    );
  });

  it('sends nothing when the deactivation is cancelled', async () => {
    const user = userEvent.setup();
    recordPatches();
    renderWithProviders(<Users />);

    const row = await findViewerRow();
    await user.click(within(row).getByRole('button', { name: /deactivate viewer user/i }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' })
    );

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(patches).toEqual([]);
  });

  it('reactivates an inactive user with one click', async () => {
    const user = userEvent.setup();
    recordPatches();
    server.use(
      http.get('/api/users', () =>
        HttpResponse.json({ success: true, users: [{ ...mockUsers.viewer, isActive: false }] })
      )
    );
    renderWithProviders(<Users />);

    const row = await findViewerRow();
    await user.click(within(row).getByRole('button', { name: /activate viewer user/i }));

    await waitFor(() =>
      expect(patches).toEqual([{ path: '/api/users/user-3', body: { isActive: true } }])
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('changes the role after confirmation', async () => {
    const user = userEvent.setup();
    recordPatches();
    renderWithProviders(<Users />);

    const row = await findViewerRow();
    await user.click(within(row).getByRole('combobox', { name: 'Role of Viewer User' }));
    await user.click(await screen.findByRole('option', { name: 'Editor' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Viewer User changes from Viewer to Editor.');
    expect(patches).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Change Role' }));

    await waitFor(() =>
      expect(patches).toEqual([{ path: '/api/users/user-3', body: { role: 'editor' } }])
    );
  });

  it('shows the server message when the last admin would lose access', async () => {
    const user = userEvent.setup();
    const message = 'At least one active admin must remain.';
    recordPatches(() =>
      HttpResponse.json({ success: false, error: 'LAST_ADMIN', message }, { status: 400 })
    );
    server.use(
      http.get('/api/users', () =>
        HttpResponse.json({
          success: true,
          users: [mockUsers.admin, { ...mockUsers.editor, role: 'admin' }],
        })
      )
    );
    renderWithProviders(<Users />);

    const row = (await screen.findByText('editor@example.com')).closest('tr');
    if (!row) throw new Error('Row not found');
    await user.click(within(row).getByRole('combobox', { name: 'Role of Editor User' }));
    await user.click(await screen.findByRole('option', { name: 'Viewer' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Change Role' })
    );

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
  });

  it('deletes a user after confirmation', async () => {
    const user = userEvent.setup();
    const deleteSpy = vi
      .spyOn(api, 'delete')
      .mockResolvedValue({ data: { success: true } } as unknown);

    renderWithProviders(<Users />);

    const row = await findViewerRow();
    await user.click(within(row).getByRole('button', { name: 'Delete Viewer User' }));
    await user.click(await screen.findByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('/users/user-3');
      expect(toast.success).toHaveBeenCalled();
    });
  });

  it('updates default projects for a user', async () => {
    const user = userEvent.setup();
    recordPatches();
    renderWithProviders(<Users />);

    const row = await findViewerRow();
    await user.click(within(row).getByRole('button', { name: /no default projects/i }));
    expect(await screen.findByRole('group', { name: 'Default Projects' })).toBeInTheDocument();
    await user.click(await screen.findByText('Test Project'));

    await waitFor(() =>
      expect(patches).toEqual([
        { path: '/api/users/user-3', body: { defaultProjectIds: ['project-1'] } },
      ])
    );
  });

  it('keeps both assignments when projects are checked in quick succession', async () => {
    const user = userEvent.setup();
    let finishSave!: () => void;
    const savePending = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    recordPatches(async () => {
      await savePending;
      return HttpResponse.json({ success: true });
    });
    renderWithProviders(<Users />);

    const row = await findViewerRow();
    await user.click(within(row).getByRole('button', { name: /no default projects/i }));
    try {
      await user.click(await screen.findByRole('checkbox', { name: 'Test Project' }));
      await waitFor(() => expect(patches).toHaveLength(1));
      await user.click(screen.getByRole('checkbox', { name: 'Another Project' }));
      expect(patches).toHaveLength(1);
    } finally {
      finishSave();
    }

    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[1].body).toEqual({ defaultProjectIds: ['project-1', 'project-2'] });
  });

  it('displays pending invitation status for users who have not accepted', async () => {
    renderWithProviders(<Users />);

    const pendingBadges = await screen.findAllByText('Pending');
    expect(pendingBadges.length).toBeGreaterThan(0);
  });

  it('can resend invitation for pending users', async () => {
    const user = userEvent.setup();
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithProviders(<Users />);

    await user.click(
      await screen.findByRole('button', { name: 'Resend invitation to Pending User' })
    );

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/users/user-4/resend-invitation');
      expect(toast.success).toHaveBeenCalled();
    });
  });

  it('offers a retry when the users fail to load', async () => {
    const user = userEvent.setup();
    let fail = true;
    server.use(
      http.get('/api/users', () =>
        fail
          ? HttpResponse.json({ success: false }, { status: 403 })
          : HttpResponse.json({ success: true, users: [mockUsers.viewer] })
      )
    );
    renderWithProviders(<Users />);

    expect(await screen.findByText("Couldn't load users")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('viewer@example.com')).toBeInTheDocument();
  });

  it('explains when there are no users', async () => {
    server.use(http.get('/api/users', () => HttpResponse.json({ success: true, users: [] })));
    renderWithProviders(<Users />);

    expect(await screen.findByText('No users yet')).toBeInTheDocument();
  });
});
