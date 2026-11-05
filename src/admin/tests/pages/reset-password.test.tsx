import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders, screen, userEvent, waitFor } from '../utils';
import { ResetPassword } from '../../pages/ResetPassword';

function renderPage(search: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/login" element={<p>Sign-in page</p>} />
    </Routes>,
    { initialEntries: [`/reset-password${search}`] }
  );
}

function acceptToken(token: string) {
  let submitted: unknown;
  server.use(
    http.get('/api/password-reset/validate/:token', ({ params }) =>
      params.token === token
        ? HttpResponse.json({ success: true, user: { email: 'user@example.com', name: 'User' } })
        : HttpResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 404 })
    ),
    http.post('/api/password-reset', async ({ request }) => {
      submitted = await request.json();
      return HttpResponse.json({ success: true });
    })
  );
  return () => submitted;
}

describe('ResetPassword', () => {
  it('explains a missing token', async () => {
    renderPage('');

    expect(await screen.findByText('Invalid Reset Link')).toBeInTheDocument();
  });

  it('explains an invalid or used link', async () => {
    acceptToken('good');
    renderPage('?token=bad');

    expect(await screen.findByText('Invalid Reset Link')).toBeInTheDocument();
  });

  it('sets a new password and links to sign-in', async () => {
    const user = userEvent.setup();
    const submitted = acceptToken('good');
    renderPage('?token=good');

    expect(await screen.findByText('For user@example.com')).toBeInTheDocument();
    await user.type(screen.getByLabelText('New password'), 'Replacement-password-2!');
    await user.type(screen.getByLabelText('Confirm password'), 'Replacement-password-2!');
    await user.click(screen.getByRole('button', { name: 'Set New Password' }));

    expect(await screen.findByText('Password Updated')).toBeInTheDocument();
    expect(submitted()).toEqual({ token: 'good', password: 'Replacement-password-2!' });
    await user.click(screen.getByRole('button', { name: 'Go to Sign In' }));
    expect(await screen.findByText('Sign-in page')).toBeInTheDocument();
  });

  it('requires matching passwords before submitting', async () => {
    const user = userEvent.setup();
    const submitted = acceptToken('good');
    renderPage('?token=good');

    await screen.findByText('For user@example.com');
    await user.type(screen.getByLabelText('New password'), 'Replacement-password-2!');
    await user.type(screen.getByLabelText('Confirm password'), 'Different-password-3!');
    await user.click(screen.getByRole('button', { name: 'Set New Password' }));

    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument();
    await waitFor(() => expect(submitted()).toBeUndefined());
  });
});
