import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth/AuthProvider';
import { takeLoginToken, type LoginToken } from '../src/auth/login-token';
import { I18nProvider } from '../src/i18n/I18nProvider';
import { BrandingProvider } from '../src/branding/BrandingProvider';
import { ThemeProvider } from '@shared-ui/theme/ThemeProvider';
import { server, TestEventSource } from './setup';

const secret = 'T'.repeat(43);
const operator = { id: 'user-1', email: 'staff@example.com', name: 'Sam Staff' };
const reporter = {
  id: 'reporter',
  email: 'jane@example.com',
  displayName: 'Jane',
  locale: 'de',
  emailUpdates: true,
};
const branding = {
  buttonColors: {
    lightButtonColor: '#0369a1',
    lightTextColor: '#ffffff',
    lightButtonHoverColor: '#075985',
    lightTextHoverColor: '#ffffff',
    darkButtonColor: '#0369a1',
    darkTextColor: '#ffffff',
    darkButtonHoverColor: '#0284c7',
    darkTextHoverColor: '#ffffff',
  },
  logoLightUrl: null,
  logoDarkUrl: null,
  faviconLightVersion: '1',
  faviconDarkVersion: '1',
};

function portalConfig(teamSignIn: boolean) {
  return {
    appName: 'BugPin',
    hideFooterBranding: false,
    locales: ['en', 'de'],
    teamSignIn,
    branding,
  };
}

function mount(path: string, initialToken: LoginToken | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ThemeProvider storageKey="bugpin-portal-theme">
      <QueryClientProvider client={client}>
        <AuthProvider>
          <I18nProvider>
            <BrandingProvider>
              <MemoryRouter initialEntries={[path]}>
                <App initialToken={initialToken} />
              </MemoryRouter>
            </BrandingProvider>
          </I18nProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
  return client;
}

function useConfig(teamSignIn: boolean) {
  server.use(
    http.get('/api/portal/config', () =>
      HttpResponse.json({ success: true, config: portalConfig(teamSignIn) })
    )
  );
}

function signedOut() {
  server.use(
    http.get('/api/portal/me', () =>
      HttpResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 })
    )
  );
}

function signedInAsOperator() {
  server.use(http.get('/api/portal/me', () => HttpResponse.json({ success: true, operator })));
}

const reportSummary = {
  id: 'report-1',
  title: 'Checkout button is broken',
  status: 'open',
  project: { id: 'project', name: 'Shop' },
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:00:00Z',
  unread: false,
  replyCount: 0,
  latestReply: null,
};

function teamViewHandlers() {
  server.use(
    http.get('/api/portal/projects', () =>
      HttpResponse.json({
        success: true,
        projects: [
          { id: 'project', name: 'Shop', allowNewReports: false, maxImageMb: 5, maxVideoMb: 50 },
        ],
      })
    ),
    http.get('/api/portal/reports', () =>
      HttpResponse.json({
        success: true,
        reports: [reportSummary],
        nextCursor: null,
        total: 1,
        unreadCount: 0,
        statusCounts: { open: 1, in_progress: 0, resolved: 0, closed: 0 },
      })
    ),
    http.get('/api/portal/reports/:id', ({ params }) =>
      HttpResponse.json({
        success: true,
        report: {
          ...reportSummary,
          id: params.id,
          description: 'The button does nothing.',
          assigneeName: null,
          files: [],
          messages: [],
          statusEvents: [],
          environment: null,
          canReply: false,
          canSubmitNewReport: false,
        },
      })
    )
  );
}

beforeEach(() => {
  useConfig(true);
  signedOut();
});
afterEach(() => {
  vi.restoreAllMocks();
});

it('shows the team sign-in link on the email sign-in page only when the config enables it', async () => {
  mount('/');
  const link = await screen.findByRole('link', {
    name: 'Team member? Sign in with your BugPin account',
  });
  expect(link).toHaveAttribute('href', '/team-login');
});

it('hides the team sign-in link when the config disables it', async () => {
  useConfig(false);
  mount('/');
  await screen.findByLabelText('Email address');
  expect(screen.queryByRole('link', { name: /Team member/ })).not.toBeInTheDocument();
});

it('opens the team sign-in page from the link', async () => {
  mount('/');
  await userEvent.click(
    await screen.findByRole('link', { name: 'Team member? Sign in with your BugPin account' })
  );
  expect(await screen.findByRole('heading', { name: 'Team sign-in' })).toBeInTheDocument();
  expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  expect(screen.getByLabelText('Password')).toBeInTheDocument();
});

it('signs in with credentials, then a two-factor code, and lands in the team view', async () => {
  teamViewHandlers();
  const requests: unknown[] = [];
  server.use(
    http.post('/api/portal/auth/team/login', async ({ request }) => {
      expect(request.credentials).toBe('include');
      expect(request.headers.get('X-BugPin-Portal')).toBe('1');
      requests.push(await request.json());
      return HttpResponse.json({
        success: true,
        status: 'twoFactorRequired',
        challengeToken: 'challenge-1',
        methods: { totp: true, recoveryCode: true },
      });
    }),
    http.post('/api/portal/auth/team/two-factor', async ({ request }) => {
      requests.push(await request.json());
      signedInAsOperator();
      return HttpResponse.json({ success: true, status: 'signedIn', operator });
    })
  );
  mount('/team-login');
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Email address'), 'staff@example.com');
  await user.type(screen.getByLabelText('Password'), 'secret-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));

  await screen.findByRole('heading', { name: 'Two-factor authentication' });
  await user.type(screen.getByLabelText('Authenticator code'), '123456');
  await user.click(screen.getByRole('button', { name: 'Verify' }));

  expect(await screen.findByRole('heading', { name: 'All reports' })).toBeInTheDocument();
  expect(requests).toEqual([
    { email: 'staff@example.com', password: 'secret-password' },
    { challengeToken: 'challenge-1', code: '123456' },
  ]);
});

it('submits a recovery code when the user switches from the authenticator code', async () => {
  const bodies: unknown[] = [];
  server.use(
    http.post('/api/portal/auth/team/login', () =>
      HttpResponse.json({
        success: true,
        status: 'twoFactorRequired',
        challengeToken: 'challenge-2',
        methods: { totp: true, recoveryCode: true },
      })
    ),
    http.post('/api/portal/auth/team/two-factor', async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({
        success: true,
        status: 'verificationSent',
        maskedEmail: 's***@example.com',
      });
    })
  );
  mount('/team-login');
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Email address'), 'staff@example.com');
  await user.type(screen.getByLabelText('Password'), 'secret-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  await user.click(await screen.findByRole('button', { name: 'Use a recovery code instead' }));
  await user.type(screen.getByLabelText('Recovery code'), 'abcde-fghij');
  await user.click(screen.getByRole('button', { name: 'Verify' }));
  await screen.findByRole('status');
  expect(bodies).toEqual([{ challengeToken: 'challenge-2', recoveryCode: 'abcde-fghij' }]);
});

it('tells the user to open the confirmation link when verification was sent', async () => {
  server.use(
    http.post('/api/portal/auth/team/login', () =>
      HttpResponse.json({
        success: true,
        status: 'verificationSent',
        maskedEmail: 's***@example.com',
      })
    )
  );
  mount('/team-login');
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Email address'), 'staff@example.com');
  await user.type(screen.getByLabelText('Password'), 'secret-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('status')).toHaveTextContent(
    'To finish signing in, open the confirmation link we sent to s***@example.com. It expires in 15 minutes.'
  );
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
});

it.each([
  ['INVALID_CREDENTIALS', 401, 'The email or password is incorrect'],
  ['PASSWORD_CHANGE_REQUIRED', 403, 'Finish setting up your account in the Admin Console'],
  ['TWO_FACTOR_SETUP_REQUIRED', 403, 'Finish setting up your account in the Admin Console'],
  ['EMAIL_DELIVERY_FAILED', 503, 'could not send the confirmation email'],
])('shows an alert for the %s login error and clears the password', async (code, status, text) => {
  server.use(
    http.post('/api/portal/auth/team/login', () =>
      HttpResponse.json({ success: false, error: code, message: 'x' }, { status })
    )
  );
  mount('/team-login');
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Email address'), 'staff@example.com');
  await user.type(screen.getByLabelText('Password'), 'secret-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(new RegExp(text, 'i'));
  expect(screen.getByLabelText('Password')).toHaveValue('');
});

it('captures the team verification token from the fragment and exchanges it only after Continue', async () => {
  teamViewHandlers();
  window.history.replaceState(null, '', `/reporter-portal/team-login/verify#${secret}`);
  const token = takeLoginToken();
  expect(token).toEqual({ kind: 'team', token: secret });
  expect(window.location.hash).toBe('');
  let exchanges = 0;
  server.use(
    http.post('/api/portal/auth/team/verify/preview', async ({ request }) => {
      expect(await request.json()).toEqual({ token: secret });
      return HttpResponse.json({ success: true, state: 'valid', maskedEmail: 's***@example.com' });
    }),
    http.post('/api/portal/auth/team/verify/exchange', async ({ request }) => {
      expect(await request.json()).toEqual({ token: secret });
      exchanges++;
      signedInAsOperator();
      return HttpResponse.json({ success: true, operator });
    })
  );
  mount('/team-login/verify', token);
  await screen.findByRole('heading', { name: 'Confirm team sign-in for s***@example.com?' });
  expect(exchanges).toBe(0);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(await screen.findByRole('heading', { name: 'All reports' })).toBeInTheDocument();
  expect(exchanges).toBe(1);
});

it('does not treat a reporter login path fragment as a team token', () => {
  window.history.replaceState(null, '', `/reporter-portal/login#${secret}`);
  expect(takeLoginToken()).toEqual({ kind: 'reporter', token: secret });
});

it('redirects the verification page to team sign-in when no token is present', async () => {
  mount('/team-login/verify');
  expect(await screen.findByRole('heading', { name: 'Team sign-in' })).toBeInTheDocument();
});

it('offers a way back to team sign-in for an expired confirmation link', async () => {
  server.use(
    http.post('/api/portal/auth/team/verify/preview', () =>
      HttpResponse.json({ success: true, state: 'expired', maskedEmail: 's***@example.com' })
    )
  );
  mount('/team-login/verify', { kind: 'team', token: secret });
  expect(
    await screen.findByText('This confirmation link expired. Sign in again to get a new one.')
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
});

it('shows the read-only team view with its strip, heading, and no New report button', async () => {
  signedInAsOperator();
  teamViewHandlers();
  mount('/reports');
  expect(await screen.findByRole('heading', { name: 'All reports' })).toBeInTheDocument();
  expect(screen.getByText('Team view')).toBeInTheDocument();
  expect(screen.getByText('You see reports as their reporters do. Read-only.')).toBeInTheDocument();
  expect(await screen.findByText('Checkout button is broken')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'My reports' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'New report' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'New report' })).not.toBeInTheDocument();
});

it('redirects /new to the report list in the team view', async () => {
  signedInAsOperator();
  teamViewHandlers();
  mount('/new');
  expect(await screen.findByRole('heading', { name: 'All reports' })).toBeInTheDocument();
});

it('replaces the reply composer with the read-only notice on a report', async () => {
  signedInAsOperator();
  teamViewHandlers();
  mount('/reports/report-1');
  expect(
    await screen.findByText('Reply to the reporter in the Admin Console.')
  ).toBeInTheDocument();
  expect(screen.getByText('Read-only team view')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Email notifications' })).not.toBeInTheDocument();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: 'All reports' }).length).toBeGreaterThan(0);
});

it('shows only Appearance and Sign out in the profile menu', async () => {
  signedInAsOperator();
  teamViewHandlers();
  mount('/reports');
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Sam Staff/ }));
  const menu = await screen.findByRole('menu');
  const items = within(menu).getAllByRole('menuitem');
  expect(items.map((item) => item.textContent)).toEqual(['Appearance', 'Sign out']);
  expect(within(menu).queryAllByRole('menuitemcheckbox')).toHaveLength(0);
  expect(within(menu).queryAllByRole('menuitemradio')).toHaveLength(0);
});

it('signs out through the logout endpoint and returns to the sign-in page', async () => {
  signedInAsOperator();
  teamViewHandlers();
  let loggedOut = 0;
  server.use(
    http.post('/api/portal/auth/logout', () => {
      loggedOut++;
      signedOut();
      return HttpResponse.json({ success: true });
    })
  );
  mount('/reports');
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Sam Staff/ }));
  await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
  await waitFor(() => expect(loggedOut).toBe(1));
  expect(await screen.findByLabelText('Email address')).toBeInTheDocument();
});

it('forces English in the team view even when the browser language is German', async () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE', 'de']);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('de-DE');
  signedInAsOperator();
  teamViewHandlers();
  mount('/reports');
  expect(await screen.findByRole('heading', { name: 'All reports' })).toBeInTheDocument();
  expect(document.documentElement.lang).toBe('en');
});

it('keeps team strings in English on a German page and forces English on the team sign-in page', async () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE', 'de']);
  mount('/');
  const teamLink = await screen.findByRole('link', {
    name: 'Team member? Sign in with your BugPin account',
  });
  expect(document.documentElement.lang).toBe('de');
  await userEvent.click(teamLink);
  expect(await screen.findByRole('heading', { name: 'Team sign-in' })).toBeInTheDocument();
  expect(document.documentElement.lang).toBe('en');
});

it('does not open an events stream in the team view', async () => {
  signedInAsOperator();
  teamViewHandlers();
  mount('/reports');
  await screen.findByRole('heading', { name: 'All reports' });
  await screen.findByText('Checkout button is broken');
  expect(TestEventSource.instances).toHaveLength(0);
});

it('still keeps German for a signed-in reporter, so the forced English is specific to the team view', async () => {
  server.use(http.get('/api/portal/me', () => HttpResponse.json({ success: true, reporter })));
  mount('/reports');
  await waitFor(() => expect(document.documentElement.lang).toBe('de'));
  expect(screen.queryByRole('heading', { name: 'All reports' })).not.toBeInTheDocument();
  expect(
    screen.queryByText('You see reports as their reporters do. Read-only.')
  ).not.toBeInTheDocument();
});
