import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { beforeEach, expect, it } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth/AuthProvider';
import { takeLoginToken } from '../src/auth/login-token';
import { I18nProvider } from '../src/i18n/I18nProvider';
import { BrandingProvider } from '../src/branding/BrandingProvider';
import { portalFetch } from '../src/api/client';
import { server } from './setup';

const tokenA = 'A'.repeat(43);
const tokenB = 'B'.repeat(43);

const reporter = {
  id: 'reporter',
  email: 'jane@example.com',
  displayName: 'Jane',
  locale: 'en',
  emailUpdates: true,
};
const config = {
  appName: 'BugPin',
  hideFooterBranding: false,
  locales: ['en'],
  branding: {
    primaryColor: '#0369a1',
    logoLightUrl: null,
    logoDarkUrl: null,
    faviconLightVersion: '1',
    faviconDarkVersion: '1',
  },
};

function mount(path = '/', token = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <I18nProvider>
          <BrandingProvider>
            <MemoryRouter initialEntries={[path]}>
              <App initialToken={token} />
            </MemoryRouter>
          </BrandingProvider>
        </I18nProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
  return client;
}
beforeEach(() => {
  server.use(
    http.get('/api/portal/me', () =>
      HttpResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 })
    ),
    http.get('/api/portal/config', () => HttpResponse.json({ success: true, config })),
    http.post('/api/portal/auth/preview', () =>
      HttpResponse.json({ success: true, state: 'valid', maskedEmail: 'j***@example.com' })
    )
  );
});

it('requests a login link with credentials and the portal header and shows the neutral response', async () => {
  let called = false;
  server.use(
    http.post('/api/portal/auth/request', async ({ request }) => {
      expect(request.credentials).toBe('include');
      expect(request.headers.get('X-BugPin-Portal')).toBe('1');
      expect(await request.json()).toEqual({ email: 'jane@example.com', locale: 'en' });
      called = true;
      return HttpResponse.json({ success: true });
    })
  );
  mount();
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Email address'), 'jane@example.com');
  await user.click(screen.getByRole('button', { name: 'Send me a sign-in link' }));
  expect(await screen.findByRole('status')).toHaveTextContent('If this address can use the portal');
  expect(called).toBe(true);
});

it('removes the fragment before the first request and exchanges only after Continue', async () => {
  window.history.replaceState(null, '', `/reporter-portal/login#${tokenA}`);
  const token = takeLoginToken();
  expect(window.location.hash).toBe('');
  let exchanges = 0;
  server.use(
    http.post('/api/portal/auth/exchange', async ({ request }) => {
      expect(window.location.hash).toBe('');
      expect(await request.json()).toEqual({ token: tokenA });
      exchanges++;
      return HttpResponse.json({
        success: true,
        reporter,
        attachedReportCount: 1,
        targetReportId: 'owned',
      });
    })
  );
  mount('/login', token);
  await screen.findByRole('heading', { name: 'Sign in as j***@example.com?' });
  expect(exchanges).toBe(0);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('heading', { name: 'My feedback' });
  expect(screen.getByText('Jane')).toBeInTheDocument();
  expect(exchanges).toBe(1);
});

it.each(['main-content', 'section', 'A'.repeat(42), 'A'.repeat(44), `${'A'.repeat(42)}=`])(
  'leaves non-token fragment %s unchanged',
  (fragment) => {
    window.history.replaceState(null, '', `/reporter-portal/login#${fragment}`);
    expect(takeLoginToken()).toBe('');
    expect(window.location.hash).toBe(`#${fragment}`);
  }
);

it('preserves the active login token when the skip link changes the fragment', async () => {
  let previews = 0;
  server.use(
    http.post('/api/portal/auth/preview', () => {
      previews++;
      return HttpResponse.json({ success: true, state: 'valid', maskedEmail: 'j***@example.com' });
    }),
    http.post('/api/portal/auth/exchange', async ({ request }) => {
      expect(await request.json()).toEqual({ token: tokenA });
      return HttpResponse.json({ success: true, reporter, attachedReportCount: 0 });
    })
  );
  window.history.replaceState(null, '', '/reporter-portal/login');
  mount('/login', tokenA);
  await screen.findByRole('button', { name: 'Continue' });
  await userEvent.click(screen.getByRole('link', { name: 'Skip to content' }));
  await waitFor(() => expect(window.location.hash).toBe('#main-content'));
  expect(previews).toBe(1);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('heading', { name: 'My feedback' });
});

it('warns before switching accounts and clears the previous account cache after exchange', async () => {
  server.use(
    http.get('/api/portal/me', () =>
      HttpResponse.json({
        success: true,
        reporter: { ...reporter, id: 'alice', displayName: 'Alice', email: 'alice@example.com' },
      })
    ),
    http.post('/api/portal/auth/exchange', () =>
      HttpResponse.json({ success: true, reporter, attachedReportCount: 0 })
    )
  );
  const client = mount('/login', tokenA);
  client.setQueryData(['portal', 'private-old-report'], { title: 'Old private title' });
  await screen.findByText('You are signed in as a***@example.com. Continue to switch accounts.');
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText('Jane');
  expect(client.getQueryData(['portal', 'private-old-report'])).toBeUndefined();
});

it('resends an expired token to the stored address without accepting another email', async () => {
  let resends = 0;
  server.use(
    http.post('/api/portal/auth/preview', () =>
      HttpResponse.json({
        success: true,
        state: 'expired',
        maskedEmail: 'j***@example.com',
        canResend: true,
      })
    ),
    http.post('/api/portal/auth/resend', async ({ request }) => {
      expect(await request.json()).toEqual({ token: tokenA, locale: 'en' });
      resends++;
      return HttpResponse.json({ success: true });
    })
  );
  mount('/login', tokenA);
  await userEvent.click(await screen.findByRole('button', { name: 'Send a new link' }));
  expect(await screen.findByRole('status')).toHaveTextContent('It expires in 15 minutes');
  expect(resends).toBe(1);
});

it('shows an invalid preview without an exchange button', async () => {
  server.use(
    http.post('/api/portal/auth/preview', () =>
      HttpResponse.json({ success: true, state: 'invalid' })
    )
  );
  mount('/login', tokenA);
  expect(await screen.findByRole('alert')).toHaveTextContent('This link is not valid');
  expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
});

it('directs expired requested links to a new request instead of offering an unavailable resend', async () => {
  server.use(
    http.post('/api/portal/auth/preview', () =>
      HttpResponse.json({
        success: true,
        state: 'expired',
        maskedEmail: 'j***@example.com',
        canResend: false,
      })
    )
  );
  mount('/login', tokenA);
  await screen.findByText('This link expired. Request a new sign-in link.');
  expect(screen.queryByRole('button', { name: 'Send a new link' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Request a new link' })).toBeInTheDocument();
});

it('handles a token becoming invalid between preview and exchange', async () => {
  server.use(
    http.post('/api/portal/auth/exchange', () =>
      HttpResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 400 })
    )
  );
  mount('/login', tokenA);
  await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This link is not valid');
});

it('captures a fresh fragment link opened in the same tab after an expired link', async () => {
  const seen: string[] = [];
  server.use(
    http.post('/api/portal/auth/preview', async ({ request }) => {
      const { token } = (await request.json()) as { token: string };
      seen.push(token);
      return HttpResponse.json(
        token === tokenB
          ? { success: true, state: 'valid', maskedEmail: 'j***@example.com' }
          : { success: true, state: 'expired', maskedEmail: 'j***@example.com', canResend: true }
      );
    })
  );
  mount('/login', tokenA);
  await screen.findByRole('button', { name: 'Send a new link' });
  act(() => {
    window.history.replaceState(null, '', `/reporter-portal/login#${tokenB}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await screen.findByRole('button', { name: 'Continue' });
  expect(seen).toEqual([tokenA, tokenB]);
  expect(window.location.hash).toBe('');
});

it('does not let a late resend response replace the fresh link Continue screen', async () => {
  let finishResend!: () => void;
  const pending = new Promise<void>((resolve) => {
    finishResend = resolve;
  });
  server.use(
    http.post('/api/portal/auth/resend', async () => {
      await pending;
      return HttpResponse.json({ success: true });
    }),
    http.post('/api/portal/auth/preview', async ({ request }) => {
      const { token } = (await request.json()) as { token: string };
      return HttpResponse.json(
        token === tokenB
          ? { success: true, state: 'valid', maskedEmail: 'j***@example.com' }
          : { success: true, state: 'expired', maskedEmail: 'j***@example.com', canResend: true }
      );
    })
  );
  mount('/login', tokenA);
  await userEvent.click(await screen.findByRole('button', { name: 'Send a new link' }));
  act(() => {
    window.history.replaceState(null, '', `/reporter-portal/login#${tokenB}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  try {
    await screen.findByRole('button', { name: 'Continue' });
    await act(async () => {
      finishResend();
      await pending;
    });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  } finally {
    finishResend();
  }
});

it('reconciles a superseded exchange without navigating away from or consuming the fresh link', async () => {
  let finishExchange!: () => void;
  const pending = new Promise<void>((resolve) => {
    finishExchange = resolve;
  });
  const bob = { ...reporter, id: 'bob', email: 'bob@example.com', displayName: 'Bob' };
  let current: typeof reporter | null = null;
  let meRequests = 0;
  const exchanged: string[] = [];
  const previewed: string[] = [];
  server.use(
    http.get('/api/portal/me', () => {
      meRequests++;
      return current
        ? HttpResponse.json({ success: true, reporter: current })
        : HttpResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }),
    http.post('/api/portal/auth/preview', async ({ request }) => {
      const { token } = (await request.json()) as { token: string };
      previewed.push(token);
      return HttpResponse.json({
        success: true,
        state: 'valid',
        maskedEmail: token === tokenB ? 'b***@example.com' : 'j***@example.com',
      });
    }),
    http.post('/api/portal/auth/exchange', async ({ request }) => {
      const { token } = (await request.json()) as { token: string };
      exchanged.push(token);
      current = token === tokenA ? reporter : bob;
      if (token === tokenA) await pending;
      return HttpResponse.json({
        success: true,
        reporter: token === tokenA ? reporter : bob,
        attachedReportCount: 0,
        targetReportId: token === tokenA ? 'old-report' : 'new-report',
      });
    })
  );
  const client = mount('/login', tokenA);
  await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(exchanged).toEqual([tokenA]));
  act(() => {
    window.history.replaceState(null, '', `/reporter-portal/login#${tokenB}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  try {
    await screen.findByRole('heading', { name: 'Sign in as b***@example.com?' });
    client.setQueryData(['portal', 'private-old-account'], { title: 'Private old report' });
    await act(async () => {
      finishExchange();
      await pending;
    });
    await screen.findByText('Jane');
    expect(meRequests).toBe(2);
    expect(client.getQueryData(['portal', 'private-old-account'])).toBeUndefined();
    expect(previewed).toEqual([tokenA, tokenB]);
    expect(exchanged).toEqual([tokenA]);
    expect(
      screen.getByRole('heading', { name: 'Sign in as b***@example.com?' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'My feedback' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'My feedback' });
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(exchanged).toEqual([tokenA, tokenB]);
  } finally {
    finishExchange();
  }
});

it('clears private queries and presents the expired-session state on a protected 401', async () => {
  server.use(
    http.get('/api/portal/me', () => HttpResponse.json({ success: true, reporter })),
    http.get('/api/portal/reports', () =>
      HttpResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 })
    )
  );
  const client = mount('/reports');
  await screen.findByText('Jane');
  client.setQueryData(['portal', 'reports'], { private: true });
  await act(async () => {
    await portalFetch('/reports').catch(() => undefined);
  });
  expect(
    await screen.findByText('Your session expired. Request a new sign-in link.')
  ).toBeInTheDocument();
  expect(client.getQueryData(['portal', 'reports'])).toBeUndefined();
  expect(screen.queryByText('Jane')).not.toBeInTheDocument();
});

it('signs out on the server before removing the local account and cached data', async () => {
  let loggedOut = false;
  server.use(
    http.get('/api/portal/me', () => HttpResponse.json({ success: true, reporter })),
    http.post('/api/portal/auth/logout', () => {
      loggedOut = true;
      return HttpResponse.json({ success: true });
    })
  );
  const client = mount('/reports');
  await screen.findByText('Jane');
  client.setQueryData(['portal', 'private'], 'secret');
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByLabelText('Email address');
  expect(loggedOut).toBe(true);
  expect(client.getQueryData(['portal', 'private'])).toBeUndefined();
});

it('keeps a failed logout retryable instead of pretending the session ended', async () => {
  server.use(
    http.get('/api/portal/me', () => HttpResponse.json({ success: true, reporter })),
    http.post('/api/portal/auth/logout', () =>
      HttpResponse.json({ success: false, error: 'FAILED' }, { status: 500 })
    )
  );
  mount('/reports');
  await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Please try again');
  expect(screen.getByText('Jane')).toBeInTheDocument();
});

it('treats logout from an expired session as successful and clears private data without an error alert', async () => {
  server.use(
    http.get('/api/portal/me', () => HttpResponse.json({ success: true, reporter })),
    http.post('/api/portal/auth/logout', () =>
      HttpResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 })
    )
  );
  const client = mount('/reports');
  await screen.findByText('Jane');
  client.setQueryData(['portal', 'private'], 'Old account data');
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByLabelText('Email address');
  expect(client.getQueryData(['portal', 'private'])).toBeUndefined();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByText('Jane')).not.toBeInTheDocument();
});

it('uses the account locale and respects white-label footer suppression', async () => {
  server.use(
    http.get('/api/portal/me', () =>
      HttpResponse.json({ success: true, reporter: { ...reporter, locale: 'de' } })
    ),
    http.get('/api/portal/config', () =>
      HttpResponse.json({ success: true, config: { ...config, hideFooterBranding: true } })
    )
  );
  mount('/reports');
  await screen.findByRole('heading', { name: 'Mein Feedback' });
  await waitFor(() => expect(document.documentElement.lang).toBe('de'));
  expect(screen.queryByText('Powered by BugPin')).not.toBeInTheDocument();
});

it('keeps button text readable with a bright custom brand color', async () => {
  server.use(
    http.get('/api/portal/config', () =>
      HttpResponse.json({
        success: true,
        config: { ...config, branding: { ...config.branding, primaryColor: '#ffff00' } },
      })
    )
  );
  mount();
  await waitFor(() =>
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#ffff00')
  );
  expect(document.documentElement.style.getPropertyValue('--primary-foreground')).toBe('#000000');
});
