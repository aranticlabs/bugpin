import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithQuery, screen, userEvent, waitFor, within } from '../utils';
import { OwnerField } from '../../components/report/OwnerField';

describe('OwnerField', () => {
  it('offers an optional invitation only when making a report claimable and sends its message', async () => {
    const writes: unknown[] = [];
    server.use(
      http.put('/api/reports/report-1/owner', async ({ request }) => {
        writes.push(await request.json());
        return HttpResponse.json({ owner: { claimableEmail: 'invitee@example.com' } });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<OwnerField report={{ id: 'report-1' }} canEdit />);
    await user.click(screen.getByRole('button', { name: 'Change owner' }));
    expect(screen.queryByLabelText('Invitation message (optional)')).not.toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Ownership' }));
    await user.click(screen.getByRole('option', { name: 'Make claimable by email' }));
    const invitation = screen.getByLabelText('Invitation message (optional)');
    expect(invitation).toHaveAttribute('maxLength', '5000');
    await user.type(screen.getByLabelText('Email address'), 'Invitee@Example.com');
    await user.type(invitation, ' Welcome to the conversation. ');
    await user.click(screen.getByRole('button', { name: 'Save owner' }));
    await waitFor(() =>
      expect(writes).toEqual([
        {
          claimableEmail: 'invitee@example.com',
          invitation: { message: 'Welcome to the conversation.' },
        },
      ])
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Change owner' }));
    await user.click(screen.getByRole('combobox', { name: 'Ownership' }));
    await user.click(screen.getByRole('option', { name: 'Make claimable by email' }));
    expect(screen.getByLabelText('Invitation message (optional)')).toHaveValue('');
  });

  it('warns before granting access to a backfilled historical description', async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <OwnerField report={{ id: 'report-1', originalDescriptionBackfilled: true }} canEdit />
    );
    await user.click(screen.getByRole('button', { name: 'Change owner' }));
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent(
      'Reporters assigned to this historical report will see its current description as the backfilled original, which may include staff edits.'
    );
  });

  it('omits the historical-description warning for an original submission', async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <OwnerField report={{ id: 'report-1', originalDescriptionBackfilled: false }} canEdit />
    );
    await user.click(screen.getByRole('button', { name: 'Change owner' }));
    expect(within(screen.getByRole('dialog')).queryByRole('alert')).not.toBeInTheDocument();
  });
  it('looks up and assigns an existing reporter without editing contact information', async () => {
    const writes: unknown[] = [];
    const lookups: string[] = [];
    server.use(
      http.get('/api/reporters/lookup', ({ request }) => {
        lookups.push(new URL(request.url).searchParams.get('email')!);
        return HttpResponse.json({ reporter: { id: 'rptr_jane' } });
      }),
      http.put('/api/reports/report-1/owner', async ({ request }) => {
        writes.push(await request.json());
        return HttpResponse.json({ owner: { reporterId: 'rptr_jane' } });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<OwnerField report={{ id: 'report-1' }} canEdit />);
    await user.click(screen.getByRole('button', { name: 'Change owner' }));
    await user.type(screen.getByLabelText('Email address'), 'Jane@Example.com');
    await user.click(screen.getByRole('button', { name: 'Save owner' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(lookups).toEqual(['jane@example.com']);
    expect(writes).toEqual([{ reporterId: 'rptr_jane' }]);
  });

  it('makes an email claimable and explains when an existing reporter cannot be found', async () => {
    const writes: unknown[] = [];
    server.use(
      http.get('/api/reporters/lookup', () => HttpResponse.json({ reporter: null })),
      http.put('/api/reports/report-1/owner', async ({ request }) => {
        writes.push(await request.json());
        return HttpResponse.json({ owner: { claimableEmail: 'new@example.com' } });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<OwnerField report={{ id: 'report-1' }} canEdit />);
    await user.click(screen.getByRole('button', { name: 'Change owner' }));
    await user.type(screen.getByLabelText('Email address'), 'New@Example.com');
    await user.click(screen.getByRole('button', { name: 'Save owner' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No reporter with this email has signed in yet'
    );
    expect(writes).toEqual([]);
    await user.click(screen.getByRole('combobox', { name: 'Ownership' }));
    await user.click(screen.getByRole('option', { name: 'Make claimable by email' }));
    await user.click(screen.getByRole('button', { name: 'Save owner' }));
    await waitFor(() => expect(writes).toEqual([{ claimableEmail: 'new@example.com' }]));
  });

  it('removes ownership and keeps failures visible', async () => {
    let allowed = false;
    let removed = false;
    server.use(
      http.delete('/api/reports/report-1/owner', () => {
        if (!allowed)
          return HttpResponse.json({ message: 'Project is read-only' }, { status: 400 });
        removed = true;
        return HttpResponse.json({ success: true });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(
      <OwnerField report={{ id: 'report-1', claimableEmail: 'jane@example.com' }} canEdit />
    );
    expect(screen.getByText('j***@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove owner' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Remove owner?' });
    expect(removed).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Remove owner' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Project is read-only');
    expect(removed).toBe(false);
    allowed = true;
    await user.click(within(dialog).getByRole('button', { name: 'Remove owner' }));
    await waitFor(() => expect(removed).toBe(true));
  });

  it('shows ownership to viewers without mutation controls', () => {
    renderWithQuery(
      <OwnerField report={{ id: 'report-1', claimableEmail: 'jane@example.com' }} canEdit={false} />
    );
    expect(screen.getByText('j***@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('asks for confirmation with masked context and lets staff cancel without removing access', async () => {
    let removed = false;
    server.use(
      http.delete('/api/reports/report-1/owner', () => {
        removed = true;
        return HttpResponse.json({ success: true });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(
      <OwnerField report={{ id: 'report-1', claimableEmail: 'jane@example.com' }} canEdit />
    );
    const trigger = screen.getByRole('button', { name: 'Remove owner' });
    await user.click(trigger);
    const dialog = screen.getByRole('alertdialog', { name: 'Remove owner?' });
    expect(dialog).toHaveAccessibleDescription(/removes portal access.*clears claimability/i);
    expect(within(dialog).getByText('j***@example.com')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(removed).toBe(false);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('locks the removal confirmation until the pending request finishes', async () => {
    let finish!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    server.use(http.delete('/api/reports/report-1/owner', () => response));
    const user = userEvent.setup();
    renderWithQuery(
      <OwnerField report={{ id: 'report-1', claimableEmail: 'jane@example.com' }} canEdit />
    );
    await user.click(screen.getByRole('button', { name: 'Remove owner' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove owner' }));
    expect(await within(dialog).findByRole('button', { name: 'Removing...' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(dialog).toBeInTheDocument();
    finish(HttpResponse.json({ success: true }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('keeps ownership separate from the contact email fallback', () => {
    renderWithQuery(
      <OwnerField
        report={{ id: 'report-1', reporterEmail: 'contact@example.com' }}
        canEdit={false}
      />
    );
    expect(screen.getByText('No owner')).toBeInTheDocument();
    expect(screen.getByText('Email recipient: c***@example.com')).toBeInTheDocument();
  });

  it('uses the owner or claimable address before the contact email', () => {
    const { rerender } = renderWithQuery(
      <OwnerField
        report={{
          id: 'report-1',
          reporterId: 'rptr_jane',
          reporterEmail: 'contact@example.com',
          owner: {
            reporterId: 'rptr_jane',
            claimableEmail: null,
            correspondentEmail: 'jane@example.com',
            reporter: {
              id: 'rptr_jane',
              email: 'jane@example.com',
              displayName: 'Jane',
              lastLoginAt: null,
            },
          },
        }}
        canEdit={false}
      />
    );
    expect(screen.getByText('Email recipient: j***@example.com')).toBeInTheDocument();
    expect(screen.queryByText('No owner')).not.toBeInTheDocument();
    rerender(
      <OwnerField
        report={{
          id: 'report-1',
          claimableEmail: 'future@example.com',
          reporterEmail: 'contact@example.com',
        }}
        canEdit={false}
      />
    );
    expect(screen.getByText('Email recipient: f***@example.com')).toBeInTheDocument();
    rerender(<OwnerField report={{ id: 'report-1' }} canEdit={false} />);
    expect(screen.getByText('No owner')).toBeInTheDocument();
    expect(screen.queryByText(/Email recipient:/)).not.toBeInTheDocument();
  });
});
