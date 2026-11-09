import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithQuery, screen, userEvent, waitFor } from '../utils';
import { OwnerField } from '../../components/report/OwnerField';

describe('OwnerField', () => {
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
    expect(await screen.findByRole('alert')).toHaveTextContent('Project is read-only');
    expect(removed).toBe(false);
    allowed = true;
    await user.click(screen.getByRole('button', { name: 'Remove owner' }));
    await waitFor(() => expect(removed).toBe(true));
  });

  it('shows ownership to viewers without mutation controls', () => {
    renderWithQuery(
      <OwnerField report={{ id: 'report-1', claimableEmail: 'jane@example.com' }} canEdit={false} />
    );
    expect(screen.getByText('j***@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
