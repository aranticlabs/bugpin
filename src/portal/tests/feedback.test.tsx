import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { beforeEach, expect, it, vi } from 'vitest';
import type {
  PortalMe,
  PortalProject,
  PortalReportDetail,
  PortalReportSummary,
} from '@shared/portal-types';
import { REPORT_STATUSES } from '@shared/types';
import { portalFetch } from '../src/api/client';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth/AuthProvider';
import { I18nProvider } from '../src/i18n/I18nProvider';
import { BrandingProvider } from '../src/branding/BrandingProvider';
import { server, TestEventSource } from './setup';

let reporter: PortalMe;
const project: PortalProject = {
  id: 'project',
  name: 'Shop',
  allowNewFeedback: true,
  maxImageMb: 1,
  maxVideoMb: 2,
};
const summary: PortalReportSummary = {
  id: 'report',
  title: 'Checkout button broken',
  status: 'resolved',
  project: { id: project.id, name: project.name },
  unread: true,
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-02T10:00:00Z',
};
const detail: PortalReportDetail = {
  ...summary,
  description: '<script>alert(1)</script>\nSee https://example.test/help',
  assigneeName: 'Anna',
  files: [
    {
      id: 'video',
      type: 'attachment',
      mimeType: 'video/webm',
      sizeBytes: 100,
      width: 640,
      height: 480,
      url: '/api/portal/files/video',
    },
  ],
  messages: [
    {
      id: 'old',
      authorKind: 'reporter',
      authorName: '',
      isOwn: false,
      isPreviousReporter: true,
      body: 'Earlier message',
      files: [],
      createdAt: summary.createdAt,
    },
    {
      id: 'staff',
      authorKind: 'staff',
      authorName: 'Anna snapshot',
      isOwn: false,
      isPreviousReporter: false,
      body: 'Can you share the browser?',
      files: [],
      createdAt: summary.updatedAt,
    },
  ],
  canReply: true,
  canSubmitNewFeedback: true,
};

function mount(path = '/reports') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <I18nProvider>
          <BrandingProvider>
            <MemoryRouter initialEntries={[path]}>
              <App />
            </MemoryRouter>
          </BrandingProvider>
        </I18nProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
  return client;
}

beforeEach(() => {
  reporter = {
    id: 'reporter',
    email: 'jane@example.com',
    displayName: 'Jane',
    locale: 'en',
    emailUpdates: true,
  };
  server.use(
    http.get('/api/portal/me', () => HttpResponse.json({ success: true, reporter })),
    http.get('/api/portal/config', () =>
      HttpResponse.json({
        success: true,
        config: { appName: 'BugPin', hideFooterBranding: false, branding: {} },
      })
    ),
    http.get('/api/portal/projects', () =>
      HttpResponse.json({ success: true, projects: [project] })
    ),
    http.get('/api/portal/reports/:id', () => HttpResponse.json({ success: true, report: detail }))
  );
});

it('uses filtered server totals, pagination, unread markers, and title count in the list', async () => {
  const cursors: (string | null)[] = [];
  server.use(
    http.get('/api/portal/reports', ({ request }) => {
      const query = new URL(request.url).searchParams;
      expect(query.get('projectId')).toBe('project');
      expect(query.get('status')).toBe('resolved');
      cursors.push(query.get('cursor'));
      return HttpResponse.json({
        success: true,
        reports: [
          query.has('cursor')
            ? { ...summary, id: 'second', title: 'Another report', unread: false }
            : summary,
        ],
        nextCursor: query.has('cursor') ? null : 'next',
        total: 2,
        unreadCount: 1,
      });
    })
  );
  mount('/reports?projectId=project&status=resolved');
  expect(await screen.findByRole('link', { name: /Checkout button/ })).toBeVisible();
  expect(screen.getByText('Unread')).toHaveClass('sr-only');
  expect(screen.getByRole('link', { name: /Unread.*Checkout button/ })).toBeVisible();
  expect(screen.getByText('●')).toHaveAttribute('aria-hidden', 'true');
  await waitFor(() => expect(document.title).toBe('(1) My feedback | BugPin'));
  await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
  expect(await screen.findByText('Another report')).toBeVisible();
  expect(cursors).toEqual([null, 'next']);
  expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
});

it('keeps four read-only board columns with excluded columns empty and filtered unread totals', async () => {
  server.use(
    http.get('/api/portal/reports', ({ request }) => {
      const query = new URL(request.url).searchParams;
      expect(query.get('groupByStatus')).toBe('true');
      expect(query.get('status')).toBe('resolved');
      return HttpResponse.json({
        success: true,
        columns: Object.fromEntries(
          REPORT_STATUSES.map((status) => [
            status,
            {
              reports: status === 'resolved' ? [summary] : [],
              total: status === 'resolved' ? 17 : 0,
              nextCursor: null,
            },
          ])
        ),
        unreadCount: 3,
      });
    })
  );
  mount('/reports?view=board&status=resolved');
  expect(await screen.findByRole('button', { name: 'Open Checkout button broken' })).toBeVisible();
  for (const name of ['Open: 0', 'In progress: 0', 'Resolved: 17', 'Closed: 0'])
    expect(screen.getByLabelText(name)).toBeInTheDocument();
  await waitFor(() => expect(document.title).toBe('(3) My feedback | BugPin'));
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(document.querySelector('[draggable="true"]')).toBeNull();
});

it('renders the localized previous reporter label, snapshots, escaped original text and private video', async () => {
  reporter.locale = 'de';
  mount('/reports/report');
  expect(await screen.findByText('Vorheriger Melder')).toBeVisible();
  expect(screen.getByText('Anna snapshot')).toBeVisible();
  expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeVisible();
  expect(document.querySelector('script')).toBeNull();
  expect(screen.getByRole('link', { name: 'https://example.test/help' })).toHaveAttribute(
    'rel',
    'noopener noreferrer nofollow'
  );
  expect(document.querySelector('video')).toHaveAttribute('src', '/api/portal/files/video');
  expect(screen.getByRole('heading', { name: 'Ursprüngliche Meldung' })).toBeVisible();
});

it('sends multipart messages with files and keeps drafts after quota failure', async () => {
  let attempts = 0;
  const originalFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input).endsWith('/reports/report/messages')) {
      const form = init?.body as FormData;
      expect(form.get('body')).toBe('Chrome 131');
      expect((form.get('files[]') as File).name).toBe('capture.png');
      attempts++;
      return Response.json(
        attempts === 1 ? { success: false, error: 'UPLOAD_QUOTA_EXCEEDED' } : { success: true },
        { status: attempts === 1 ? 413 : 200 }
      );
    }
    return originalFetch(input, init);
  });
  mount('/reports/report');
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Message'), 'Chrome 131');
  await user.upload(
    screen.getByLabelText('Files'),
    new File(['png'], 'capture.png', { type: 'image/png' })
  );
  await user.click(screen.getByRole('button', { name: 'Send' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('upload quota');
  expect(screen.getByLabelText('Message')).toHaveValue('Chrome 131');
  expect(screen.getByText('capture.png')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(screen.getByLabelText('Message')).toHaveValue(''));
  expect(screen.queryByText('capture.png')).not.toBeInTheDocument();
});

it('rejects oversized files and more than five files before sending', async () => {
  mount('/reports/report');
  const user = userEvent.setup();
  const input = await screen.findByLabelText('Files');
  await user.upload(
    input,
    new File([new Uint8Array(1024 * 1024 + 1)], 'large.png', { type: 'image/png' })
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('up to 5');
  expect(screen.queryByText('large.png')).not.toBeInTheDocument();
  await user.upload(
    input,
    Array.from({ length: 6 }, (_, n) => new File(['x'], `${n}.png`, { type: 'image/png' }))
  );
  expect(screen.getByRole('alert')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
});

it.each([
  ['closed', 'This report is closed.'],
  ['disabled', 'The team answers through other channels.'],
])('shows the %s state without a composer', async (state, text) => {
  server.use(
    http.get('/api/portal/reports/report', () =>
      HttpResponse.json({
        success: true,
        report: { ...detail, canReply: false, status: state === 'closed' ? 'closed' : 'resolved' },
      })
    )
  );
  mount('/reports/report');
  expect(await screen.findByText(text)).toBeVisible();
  expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'New feedback' }) !== null).toBe(state === 'closed');
});

it('rejects a stale composer after closure and refreshes into the closed state', async () => {
  let closed = false;
  server.use(
    http.get('/api/portal/reports/report', () =>
      HttpResponse.json({
        success: true,
        report: closed ? { ...detail, status: 'closed', canReply: false } : detail,
      })
    ),
    http.post('/api/portal/reports/report/messages', () => {
      closed = true;
      return HttpResponse.json({ success: false, error: 'REPORT_CLOSED' }, { status: 409 });
    })
  );
  mount('/reports/report');
  await userEvent.type(await screen.findByLabelText('Message'), 'Late reply');
  await userEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(screen.queryByLabelText('Message')).not.toBeInTheDocument());
  expect(screen.getAllByText('This report is closed.').length).toBeGreaterThan(0);
});

it('submits new feedback only to an eligible owned project and opens its detail', async () => {
  server.use(
    http.get('/api/portal/projects', () =>
      HttpResponse.json({
        success: true,
        projects: [
          project,
          { ...project, id: 'disabled', name: 'Hidden', allowNewFeedback: false },
        ],
      })
    ),
    http.post('/api/portal/reports', async ({ request }) => {
      const form = await request.formData();
      expect(form.get('projectId')).toBe('project');
      expect(form.get('title')).toBe('New issue');
      expect(form.get('description')).toBe('Details');
      return HttpResponse.json({ success: true, report: detail }, { status: 201 });
    })
  );
  mount('/new');
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Title'), 'New issue');
  await user.type(screen.getByLabelText('Description'), 'Details');
  await user.click(screen.getByRole('button', { name: 'Submit' }));
  expect(await screen.findByRole('heading', { name: detail.title })).toBeVisible();
});

it('requires an eligible selection instead of silently switching an ineligible project', async () => {
  mount('/new?projectId=not-owned');
  expect(await screen.findByLabelText('Title')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
});

it('saves a display name and email preference through the profile menu', async () => {
  server.use(
    http.patch('/api/portal/me', async ({ request }) => {
      reporter = { ...reporter, ...((await request.json()) as Partial<PortalMe>) };
      return HttpResponse.json({ success: true, reporter });
    })
  );
  mount();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Jane' }));
  await user.click(screen.getByRole('menuitem', { name: 'Display name' }));
  const dialog = screen.getByRole('dialog');
  const input = within(dialog).getByLabelText('Display name');
  await user.clear(input);
  await user.type(input, 'Janet');
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('button', { name: 'Janet' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Janet' }));
  await user.click(screen.getByRole('menuitemcheckbox', { name: 'Email me about updates' }));
  await waitFor(() => expect(reporter.emailUpdates).toBe(false));
});

it('clears private report content immediately on access changes and hides revoked feedback', async () => {
  let revoked = false;
  server.use(
    http.get('/api/portal/reports/report', async () => {
      if (revoked)
        return HttpResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 });
      return HttpResponse.json({ success: true, report: detail });
    })
  );
  const client = mount('/reports/report');
  await screen.findByText('Earlier message');
  revoked = true;
  act(() => TestEventSource.instances[0].dispatchEvent(new Event('access.changed')));
  expect(client.getQueryData(['portal', 'report', 'report'])).toBeUndefined();
  await waitFor(() => expect(screen.queryByText('Earlier message')).not.toBeInTheDocument());
  expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeVisible();
  expect(client.getQueryData(['portal', 'report', 'report'])).toBeUndefined();
});

it('invalidates live reports, reconnects, and expires a revoked session', async () => {
  let reads = 0;
  server.use(
    http.get('/api/portal/reports', () => {
      reads++;
      return HttpResponse.json({
        success: true,
        reports: [summary],
        nextCursor: null,
        total: 1,
        unreadCount: 1,
      });
    })
  );
  mount();
  await screen.findByText(summary.title);
  const events = TestEventSource.instances[0];
  expect(events.options?.withCredentials).toBe(true);
  act(() => events.dispatchEvent(new Event('message.created')));
  await waitFor(() => expect(reads).toBe(2));
  await act(async () => {
    await events.onerror?.();
  });
  expect(screen.getByRole('status')).toHaveTextContent('Reconnecting');
  act(() => events.onopen?.());
  await waitFor(() =>
    expect(screen.queryByText('Connection lost. Reconnecting…')).not.toBeInTheDocument()
  );
  server.use(
    http.get('/api/portal/me', () =>
      HttpResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 })
    )
  );
  await act(async () => {
    await events.onerror?.();
  });
  expect(await screen.findByLabelText('Email address')).toBeVisible();
  expect(events.close).toHaveBeenCalled();
});

it('closes the live connection on unmount', async () => {
  const result = render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <I18nProvider>
          <BrandingProvider>
            <MemoryRouter>
              <App />
            </MemoryRouter>
          </BrandingProvider>
        </I18nProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
  await screen.findByRole('button', { name: 'Jane' });
  const events = TestEventSource.instances[0];
  result.unmount();
  expect(events.close).toHaveBeenCalledTimes(1);
});

it('updates the account language and immediately localizes the page', async () => {
  server.use(
    http.patch('/api/portal/me', async ({ request }) => {
      const changes = (await request.json()) as Partial<PortalMe>;
      expect(changes).toEqual({ locale: 'de' });
      reporter = { ...reporter, ...changes };
      return HttpResponse.json({ success: true, reporter });
    })
  );
  mount();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Jane' }));
  const language = screen.getByRole('menuitem', { name: 'Language' });
  language.focus();
  await user.keyboard('{ArrowRight}');
  await user.click(await screen.findByRole('menuitemradio', { name: 'Deutsch' }));
  expect(await screen.findByRole('heading', { name: 'Mein Feedback' })).toBeVisible();
  expect(document.documentElement.lang).toBe('de');
});

it('shows no new feedback action when no owned project permits submissions', async () => {
  server.use(
    http.get('/api/portal/projects', () =>
      HttpResponse.json({ success: true, projects: [{ ...project, allowNewFeedback: false }] })
    )
  );
  mount('/new');
  expect(await screen.findByText('No project currently allows new feedback.')).toBeVisible();
  expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
});

it('paginates an individual board column without changing its full count or unread total', async () => {
  const cursors: (string | null)[] = [];
  server.use(
    http.get('/api/portal/reports', ({ request }) => {
      const query = new URL(request.url).searchParams;
      expect(query.get('status')).toBe('open');
      cursors.push(query.get('cursor'));
      const next = query.has('cursor');
      return HttpResponse.json({
        success: true,
        columns: Object.fromEntries(
          REPORT_STATUSES.map((status) => [
            status,
            {
              reports:
                status === 'open'
                  ? [
                      {
                        ...summary,
                        id: next ? 'next' : 'first',
                        title: next ? 'Next column item' : 'First column item',
                        status: 'open',
                      },
                    ]
                  : [],
              total: status === 'open' ? 50 : 0,
              nextCursor: status === 'open' && !next ? 'column-next' : null,
            },
          ])
        ),
        unreadCount: 2,
      });
    })
  );
  mount('/reports?view=board&status=open');
  await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));
  expect(await screen.findByRole('button', { name: 'Open Next column item' })).toBeVisible();
  expect(screen.getByLabelText('Open: 50')).toBeInTheDocument();
  expect(cursors).toEqual([null, 'column-next']);
  await waitFor(() => expect(document.title).toBe('(2) My feedback | BugPin'));
});

it('ignores a canceled request response before dispatching session expiry', async () => {
  const abort = new AbortController();
  let finish!: (response: Response) => void;
  vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      })
  );
  const expired = vi.fn();
  window.addEventListener('bugpin:portal-session-expired', expired);
  try {
    const request = portalFetch('/reports', { signal: abort.signal });
    abort.abort();
    finish(Response.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 }));
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(expired).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener('bugpin:portal-session-expired', expired);
  }
});

it.each(['sign-out', 'session-expiry'])(
  'clears the private title after %s on the reports page',
  async (action) => {
    server.use(
      http.get('/api/portal/reports', () =>
        HttpResponse.json({
          success: true,
          reports: [summary],
          nextCursor: null,
          total: 1,
          unreadCount: 7,
        })
      ),
      http.post('/api/portal/auth/logout', () => HttpResponse.json({ success: true }))
    );
    mount();
    await waitFor(() => expect(document.title).toBe('(7) My feedback | BugPin'));
    if (action === 'sign-out') {
      await userEvent.click(screen.getByRole('button', { name: 'Jane' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    } else act(() => window.dispatchEvent(new Event('bugpin:portal-session-expired')));
    await screen.findByLabelText('Email address');
    expect(document.title).toBe('Reporter Portal | BugPin');
  }
);

it('sets a neutral title on a cold signed-out reports load', async () => {
  document.title = '';
  server.use(
    http.get('/api/portal/me', () =>
      HttpResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 })
    )
  );
  mount();
  await screen.findByLabelText('Email address');
  expect(document.title).toBe('Reporter Portal | BugPin');
});

it('gives every original, message, and metadata file control a unique contextual name', async () => {
  const image = { ...detail.files[0], mimeType: 'image/png' };
  server.use(
    http.get('/api/portal/reports/report', () =>
      HttpResponse.json({
        success: true,
        report: {
          ...detail,
          messages: detail.messages.map((message, index) => ({
            ...message,
            files: [1, 2].map((number) => ({
              ...image,
              id: `message-${index}-${number}`,
              url: `/api/portal/files/message-${index}-${number}`,
            })),
          })),
        },
      })
    )
  );
  mount('/reports/report');
  await screen.findByRole('heading', { name: detail.title });
  for (const context of ['Original report', 'Conversation 1', 'Conversation 2']) {
    expect(screen.getByRole('link', { name: `${context}: Open file 1` })).toBeInTheDocument();
  }
  expect(screen.getByRole('link', { name: 'Conversation 2: Open file 2' })).toBeInTheDocument();
  const links = screen
    .getAllByRole('link')
    .filter((link) => link.textContent?.includes('Open file'));
  expect(new Set(links.map((link) => link.getAttribute('aria-label'))).size).toBe(links.length);
  const images = screen
    .getAllByRole('img')
    .filter((image) => image.getAttribute('src')?.startsWith('/api/portal/files/'));
  expect(new Set(images.map((image) => image.getAttribute('alt'))).size).toBe(images.length);
  expect(screen.getByRole('link', { name: 'My feedback' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Report details' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Jane' })).toBeVisible();
});

it('replaces refused CLOSED streams with capped backoff and resets the delay after recovery', async () => {
  mount();
  await screen.findByRole('button', { name: 'Jane' });
  const originalFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
    String(input).endsWith('/me')
      ? Promise.resolve(Response.json({ success: true, reporter }))
      : originalFetch(input, init)
  );
  vi.useFakeTimers();
  try {
    for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      const count = TestEventSource.instances.length;
      const source = TestEventSource.instances[count - 1];
      source.readyState = TestEventSource.CLOSED;
      await act(async () => {
        await source.onerror?.();
        await source.onerror?.();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delay - 1);
      });
      expect(TestEventSource.instances).toHaveLength(count);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(TestEventSource.instances).toHaveLength(count + 1);
      expect(source.close).toHaveBeenCalledTimes(1);
      expect(
        TestEventSource.instances.filter((source) => source.readyState !== TestEventSource.CLOSED)
      ).toHaveLength(1);
    }
    const recovered = TestEventSource.instances[TestEventSource.instances.length - 1]!;
    recovered.readyState = 1;
    act(() => recovered.onopen?.());
    recovered.readyState = TestEventSource.CLOSED;
    await act(async () => {
      await recovered.onerror?.();
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(TestEventSource.instances[TestEventSource.instances.length - 1]).not.toBe(recovered);
  } finally {
    cleanup();
    vi.useRealTimers();
  }
});

it.each(['cleanup', '401'])('cancels a refused stream retry on %s', async (reason) => {
  mount();
  await screen.findByRole('button', { name: 'Jane' });
  const source = TestEventSource.instances[0];
  source.readyState = TestEventSource.CLOSED;
  const originalFetch = globalThis.fetch;
  let expired = false;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
    String(input).endsWith('/me')
      ? Promise.resolve(
          Response.json(
            expired ? { success: false, error: 'UNAUTHORIZED' } : { success: true, reporter },
            { status: expired ? 401 : 200 }
          )
        )
      : originalFetch(input, init)
  );
  vi.useFakeTimers();
  try {
    await act(async () => {
      await source.onerror?.();
    });
    if (reason === 'cleanup') cleanup();
    else {
      expired = true;
      await act(async () => {
        await source.onerror?.();
      });
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(TestEventSource.instances).toHaveLength(1);
    expect(source.close).toHaveBeenCalled();
    if (reason === '401') expect(screen.getByLabelText('Email address')).toBeVisible();
  } finally {
    cleanup();
    vi.useRealTimers();
  }
});

it('retries session validation before replacing a closed stream when validation is temporarily unavailable', async () => {
  mount();
  await screen.findByRole('button', { name: 'Jane' });
  const source = TestEventSource.instances[0];
  source.readyState = TestEventSource.CLOSED;
  const originalFetch = globalThis.fetch;
  let checks = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if (!String(input).endsWith('/me')) return originalFetch(input, init);
    checks++;
    return Promise.resolve(
      Response.json(
        checks === 1 ? { success: false, error: 'UNAVAILABLE' } : { success: true, reporter },
        { status: checks === 1 ? 503 : 200 }
      )
    );
  });
  vi.useFakeTimers();
  try {
    await act(async () => {
      await source.onerror?.();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(checks).toBe(2);
    expect(TestEventSource.instances).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(TestEventSource.instances).toHaveLength(2);
  } finally {
    cleanup();
    vi.useRealTimers();
  }
});
