import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '../../utils';
import { server } from '../../mocks/server';
import { Gamification } from '../../../pages/console/Gamification';

describe('Gamification settings', () => {
  it('summarizes who takes part and links to Users instead of listing people', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Gamification />);
    expect(await screen.findByText('Off for everyone')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage people in Users' })).toHaveAttribute(
      'href',
      '/settings/users'
    );

    await user.click(screen.getByRole('switch', { name: 'Enable gamification' }));

    expect(screen.getByText('On for 1 of 1 people')).toBeInTheDocument();
    expect(screen.getByText(/1 viewer, who never take part/)).toBeInTheDocument();
  });

  it('offers the new-user default and the opt-out, disabled while gamification is off', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Gamification />);
    const newUsers = await screen.findByRole('switch', { name: 'Turn on for new users' });
    const optOut = screen.getByRole('switch', { name: 'Let users turn it off for themselves' });
    expect(newUsers).toBeDisabled();
    expect(optOut).toBeChecked();

    await user.click(screen.getByRole('switch', { name: 'Enable gamification' }));
    expect(newUsers).toBeEnabled();
    await user.click(optOut);
    expect(optOut).not.toBeChecked();
  });

  it('offers the team ranking switch, on by default', async () => {
    renderWithProviders(<Gamification />);
    const ranking = await screen.findByRole('switch', { name: 'Show team ranking' });
    expect(ranking).toBeChecked();
    expect(ranking).toBeDisabled();
  });
});

describe('Gamification settings edits', () => {
  it('keeps unsaved edits when the saved settings are loaded again', async () => {
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<Gamification />);
    const enable = await screen.findByRole('switch', { name: 'Enable gamification' });
    await user.click(enable);
    expect(enable).toBeChecked();

    // Another admin saved a change meanwhile, so the reloaded settings differ
    server.use(
      http.get('/api/gamification', () =>
        HttpResponse.json({
          success: true,
          gamification: {
            enabled: false,
            newUsersDefault: false,
            allowOptOut: true,
            showRanking: true,
            users: [],
          },
        })
      )
    );
    await queryClient.refetchQueries({ queryKey: ['gamification'] });
    expect(queryClient.getQueryData(['gamification', 'settings'])).toMatchObject({
      newUsersDefault: false,
    });

    expect(screen.getByRole('switch', { name: 'Enable gamification' })).toBeChecked();
  });

  it('warns that people who opted out take part again when opting out is no longer allowed', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/gamification', () =>
        HttpResponse.json({
          success: true,
          gamification: {
            enabled: true,
            newUsersDefault: true,
            allowOptOut: true,
            showRanking: true,
            users: [
              {
                id: 'u1',
                name: 'Alex',
                email: 'a@example.com',
                role: 'admin',
                enabled: true,
                optedOut: true,
              },
              {
                id: 'u2',
                name: 'Sam',
                email: 's@example.com',
                role: 'editor',
                enabled: true,
                optedOut: true,
              },
              {
                id: 'u3',
                name: 'Kim',
                email: 'k@example.com',
                role: 'editor',
                enabled: false,
                optedOut: true,
              },
            ],
          },
        })
      )
    );
    renderWithProviders(<Gamification />);
    const optOut = await screen.findByRole('switch', {
      name: 'Let users turn it off for themselves',
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(optOut);

    expect(screen.getByRole('alert')).toHaveTextContent(
      '2 people turned gamification off for themselves. Once you save, they take part again'
    );
  });
});

describe('Gamification settings save', () => {
  it('sends only the changed workspace settings', async () => {
    const user = userEvent.setup();
    let savedBody: unknown;
    server.use(
      http.put('/api/gamification', async ({ request }) => {
        savedBody = await request.json();
        return HttpResponse.json({
          success: true,
          gamification: {
            enabled: true,
            newUsersDefault: true,
            allowOptOut: true,
            showRanking: true,
            users: [],
          },
        });
      })
    );
    renderWithProviders(<Gamification />);

    await user.click(await screen.findByRole('switch', { name: 'Enable gamification' }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(savedBody).toEqual({ enabled: true }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
    );
  });

  it('keeps the edit when saving fails', async () => {
    const user = userEvent.setup();
    server.use(
      http.put('/api/gamification', () =>
        HttpResponse.json({ success: false, message: 'Saving failed' }, { status: 400 })
      )
    );
    renderWithProviders(<Gamification />);

    const enable = await screen.findByRole('switch', { name: 'Enable gamification' });
    await user.click(enable);
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByRole('button', { name: /save changes/i })).toBeEnabled();
    expect(enable).toBeChecked();
  });
});
