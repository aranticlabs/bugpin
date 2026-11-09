import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { renderWithProviders, screen, userEvent, waitFor, within } from '../../utils';
import { Reporters } from '../../../pages/console/Reporters';
import type { ReporterSummary } from '@shared/reporter-types';

const reporter: ReporterSummary = {
  id: 'rptr_jane',
  email: 'jane@example.com',
  displayName: 'Jane',
  projects: [{ id: 'project-1', name: 'Test Project' }],
  ownedReportCount: 2,
  lastLoginAt: '2026-01-01T12:00:00Z',
  status: 'active',
};
let rows: ReporterSummary[];
beforeEach(() => {
  rows = [reporter];
  server.use(
    http.get('/api/reporters', () =>
      HttpResponse.json({ reporters: rows, total: rows.length, nextCursor: null })
    )
  );
});

async function openAction(name: string, user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Actions for jane@example.com' }));
  await user.click(screen.getByRole('menuitem', { name }));
  return screen.getByRole('alertdialog');
}

describe('Reporters', () => {
  it('lists account details and links to the reporter-filtered reports list', async () => {
    renderWithProviders(<Reporters />);
    expect(await screen.findByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText('Jane')).toBeInTheDocument();
    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(
      within(screen.getByText('jane@example.com').closest('tr')!).getByText('Active')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View reports by jane@example.com' })).toHaveAttribute(
      'href',
      '/reports?reporterId=rptr_jane&view=list'
    );
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Email',
      'Display name',
      'Projects',
      'Reports',
      'Last login',
      'Status',
      'Actions',
    ]);
  });

  it('loads another cursor page and resets pagination when searching or changing status', async () => {
    const requests: URLSearchParams[] = [];
    server.use(
      http.get('/api/reporters', ({ request }) => {
        const params = new URL(request.url).searchParams;
        requests.push(params);
        const filtered = params.has('search') || params.has('status');
        return HttpResponse.json({
          reporters: filtered
            ? []
            : params.has('cursor')
              ? [{ ...reporter, id: 'rptr_other', email: 'other@example.com' }]
              : [reporter],
          total: filtered ? 0 : 2,
          nextCursor: filtered || params.has('cursor') ? null : 'next-page',
        });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<Reporters />);
    await user.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('other@example.com')).toBeInTheDocument();
    expect(requests[requests.length - 1]?.get('cursor')).toBe('next-page');
    await user.type(screen.getByLabelText('Search reporters'), 'nobody');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('No matching reporters')).toBeInTheDocument();
    expect(requests[requests.length - 1]?.get('search')).toBe('nobody');
    expect(requests[requests.length - 1]?.has('cursor')).toBe(false);
    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(screen.getByRole('option', { name: 'Suspended' }));
    await waitFor(() => expect(requests[requests.length - 1]?.get('status')).toBe('suspended'));
    expect(requests[requests.length - 1]?.has('cursor')).toBe(false);
  });

  it.each([
    ['suspend', 'Suspend reporter', 'active'],
    ['unsuspend', 'Unsuspend reporter', 'suspended'],
    ['revoke-sessions', 'Revoke sessions', 'active'],
  ] as const)('confirms and performs %s', async (operation, label, status) => {
    rows = [{ ...reporter, status }];
    let applied = false;
    server.use(
      http.post(`/api/reporters/rptr_jane/${operation}`, () => {
        applied = true;
        return HttpResponse.json({ success: true });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<Reporters />);
    const dialog = await openAction(label, user);
    expect(applied).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: label }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(applied).toBe(true);
  });

  it.each([false, true])(
    'deletes with contact erasure %s and refreshes the list',
    async (erase) => {
      let body: unknown;
      server.use(
        http.delete('/api/reporters/rptr_jane', async ({ request }) => {
          body = await request.json();
          rows = [];
          return HttpResponse.json({ success: true });
        })
      );
      const user = userEvent.setup();
      renderWithProviders(<Reporters />);
      const dialog = await openAction('Delete reporter', user);
      const checkbox = within(dialog).getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
      if (erase) await user.click(checkbox);
      await user.click(within(dialog).getByRole('button', { name: 'Delete reporter' }));
      expect(await screen.findByText('No reporters yet')).toBeInTheDocument();
      expect(body).toEqual({ eraseContactDetails: erase });
    }
  );

  it('keeps a failed action open with its error message', async () => {
    server.use(
      http.post('/api/reporters/rptr_jane/suspend', () =>
        HttpResponse.json({ message: 'Reporter no longer exists' }, { status: 404 })
      )
    );
    const user = userEvent.setup();
    renderWithProviders(<Reporters />);
    const dialog = await openAction('Suspend reporter', user);
    await user.click(within(dialog).getByRole('button', { name: 'Suspend reporter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Reporter no longer exists');
    expect(dialog).toBeInTheDocument();
  });

  it('focuses Cancel and restores focus after cancelling permanent deletion', async () => {
    let removed = false;
    server.use(
      http.delete('/api/reporters/rptr_jane', () => {
        removed = true;
        return HttpResponse.json({ success: true });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<Reporters />);
    const dialog = await openAction('Delete reporter', user);
    expect(dialog).toHaveAccessibleName('Delete reporter');
    expect(dialog).toHaveAccessibleDescription(/permanently deletes this reporter account/i);
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveFocus();
    await user.click(cancel);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(removed).toBe(false);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Actions for jane@example.com' })).toHaveFocus()
    );
  });

  it('locks deletion and contact erasure while the request is pending', async () => {
    let finish!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    server.use(http.delete('/api/reporters/rptr_jane', () => response));
    const user = userEvent.setup();
    renderWithProviders(<Reporters />);
    const dialog = await openAction('Delete reporter', user);
    await user.click(within(dialog).getByRole('button', { name: 'Delete reporter' }));
    expect(await within(dialog).findByRole('button', { name: 'Updating...' })).toBeDisabled();
    expect(within(dialog).getByRole('checkbox')).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(dialog).toBeInTheDocument();
    finish(HttpResponse.json({ success: true }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('accepts each defined status filter', async () => {
    const requested: Array<string | null> = [];
    server.use(
      http.get('/api/reporters', ({ request }) => {
        requested.push(new URL(request.url).searchParams.get('status'));
        return HttpResponse.json({ reporters: rows, total: rows.length, nextCursor: null });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<Reporters />);
    await screen.findByText('jane@example.com');
    for (const [label, status] of [
      ['Active', 'active'],
      ['Suspended', 'suspended'],
      ['All statuses', null],
    ] as const) {
      await user.click(screen.getByRole('combobox', { name: 'Status' }));
      await user.click(screen.getByRole('option', { name: label }));
      await waitFor(() => expect(requested[requested.length - 1]).toBe(status));
    }
  });
});
