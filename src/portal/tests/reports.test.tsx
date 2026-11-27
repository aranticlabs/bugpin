import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { PortalApiError, portalFetch } from '../src/api/client';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth/AuthProvider';
import { I18nProvider } from '../src/i18n/I18nProvider';
import { BrandingProvider } from '../src/branding/BrandingProvider';
import { ThemeProvider } from '@shared-ui/theme/ThemeProvider';
import { server, TestEventSource } from './setup';

let reporter: PortalMe;
const project: PortalProject = {
  id: 'project',
  name: 'Shop',
  allowNewReports: true,
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
  replyCount: 2,
  latestReply: {
    authorKind: 'staff',
    authorName: 'Anna snapshot',
    isOwn: false,
    isPreviousReporter: false,
    body: 'Can you share the browser?',
    fileCount: 0,
    createdAt: '2026-11-02T10:00:00Z',
  },
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
  statusEvents: [],
  environment: null,
  canReply: true,
  canSubmitNewReport: true,
};

const statusCounts = { open: 3, in_progress: 0, resolved: 2, closed: 1 };

function unreadResponse(unreadCount: number) {
  return HttpResponse.json({
    success: true,
    reports: [],
    nextCursor: null,
    total: 0,
    unreadCount,
    statusCounts,
  });
}

function mount(path = '/reports') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ThemeProvider storageKey="bugpin-portal-theme">
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
    </ThemeProvider>
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
        config: {
          appName: 'BugPin',
          hideFooterBranding: false,
          branding: {
            buttonColors: {
              lightButtonColor: '#02658D',
              lightTextColor: '#ffffff',
              lightButtonHoverColor: '#024F6F',
              lightTextHoverColor: '#ffffff',
              darkButtonColor: '#02658D',
              darkTextColor: '#ffffff',
              darkButtonHoverColor: '#036F9B',
              darkTextHoverColor: '#ffffff',
            },
            logoLightUrl: null,
            logoDarkUrl: null,
            faviconLightVersion: '1',
            faviconDarkVersion: '1',
          },
        },
      })
    ),
    http.get('/api/portal/projects', () =>
      HttpResponse.json({ success: true, projects: [project] })
    ),
    http.get('/api/portal/reports/:id', () => HttpResponse.json({ success: true, report: detail }))
  );
});

it('uses filtered server totals, pagination, rich rows, status tabs, and title count in the list', async () => {
  const cursors: (string | null)[] = [];
  server.use(
    http.get('/api/portal/reports', ({ request }) => {
      const query = new URL(request.url).searchParams;
      if (query.get('limit') === '1') return unreadResponse(1);
      expect(query.get('projectId')).toBe('project');
      expect(query.get('status')).toBe('resolved');
      cursors.push(query.get('cursor'));
      return HttpResponse.json({
        success: true,
        reports: [
          query.has('cursor')
            ? {
                ...summary,
                id: 'second',
                title: 'Another report',
                unread: false,
                replyCount: 0,
                latestReply: null,
              }
            : summary,
        ],
        nextCursor: query.has('cursor') ? null : 'next',
        total: 2,
        unreadCount: 1,
        statusCounts,
      });
    })
  );
  mount('/reports?projectId=project&status=resolved');
  const row = await screen.findByRole('link', { name: /Checkout button/ });
  expect(within(row).getByText('New reply')).toBeVisible();
  expect(within(row).getByText('Anna snapshot:')).toBeVisible();
  expect(within(row).getByText('Can you share the browser?')).toBeVisible();
  expect(within(row).getByText('Replies: 2')).toHaveClass('sr-only');
  const tabs = screen.getByRole('tablist', { name: 'Filter by status' });
  expect(within(tabs).getByRole('tab', { name: 'Resolved 2' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  expect(within(tabs).getByRole('tab', { name: 'All 6' })).toBeInTheDocument();
  await waitFor(() => expect(document.title).toBe('(1) My reports | BugPin'));
  await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
  expect(await screen.findByText('Another report')).toBeVisible();
  expect(cursors).toEqual([null, 'next']);
  expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
});

it('keeps status, search, and sort in the URL and the list request', async () => {
  const requests: URLSearchParams[] = [];
  const last = () => requests[requests.length - 1];
  server.use(
    http.get('/api/portal/reports', ({ request }) => {
      const query = new URL(request.url).searchParams;
      if (query.get('limit') === '1') return unreadResponse(0);
      requests.push(query);
      return HttpResponse.json({
        success: true,
        reports: [summary],
        nextCursor: null,
        total: 1,
        unreadCount: 1,
        statusCounts,
      });
    })
  );
  mount('/reports');
  const user = userEvent.setup({ delay: null });
  await screen.findByRole('link', { name: /Checkout button/ });
  await user.click(screen.getByRole('tab', { name: 'Open 3' }));
  await waitFor(() => expect(last()?.get('status')).toBe('open'));
  await user.type(screen.getByRole('searchbox', { name: 'Search reports' }), 'checkout');
  await waitFor(() => expect(last()?.get('q')).toBe('checkout'));
  expect(requests.filter((query) => query.has('q'))).toHaveLength(1);
  await user.click(screen.getByRole('combobox', { name: 'Sort' }));
  await user.click(await screen.findByRole('option', { name: 'Newest first' }));
  await waitFor(() => expect(last()?.get('sort')).toBe('newest'));
  expect(last()?.get('status')).toBe('open');
  expect(last()?.get('q')).toBe('checkout');
  await user.click(screen.getByRole('tab', { name: 'All 6' }));
  await waitFor(() => expect(last()?.has('status')).toBe(false));
});

it('keeps a filter picked while a search is pending and searches for any word', async () => {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get('/api/portal/reports', ({ request }) => {
      const query = new URL(request.url).searchParams;
      if (query.get('limit') === '1') return unreadResponse(0);
      requests.push(query);
      return HttpResponse.json({
        success: true,
        reports: [summary],
        nextCursor: null,
        total: 1,
        unreadCount: 0,
        statusCounts,
      });
    })
  );
  mount('/reports');
  const user = userEvent.setup({ delay: null });
  await screen.findByRole('link', { name: /Checkout button/ });
  await user.type(screen.getByRole('searchbox', { name: 'Search reports' }), 'all');
  await user.click(screen.getByRole('tab', { name: 'Open 3' }));
  await waitFor(() => expect(requests[requests.length - 1]?.get('q')).toBe('all'));
  expect(requests[requests.length - 1]?.get('status')).toBe('open');
  expect(screen.getByRole('searchbox', { name: 'Search reports' })).toHaveValue('all');
});

it('previews a reply that only has attachments with its file count', async () => {
  server.use(
    http.get('/api/portal/reports', ({ request }) => {
      const query = new URL(request.url).searchParams;
      if (query.get('limit') === '1') return unreadResponse(0);
      return HttpResponse.json({
        success: true,
        reports: [{ ...summary, latestReply: { ...summary.latestReply!, body: '', fileCount: 2 } }],
        nextCursor: null,
        total: 1,
        unreadCount: 0,
        statusCounts,
      });
    })
  );
  mount('/reports');
  const row = await screen.findByRole('link', { name: /Checkout button/ });
  expect(within(row).getByText('Files (2)')).toBeVisible();
});

it('keeps the status tabs on the board and empties the excluded columns', async () => {
  server.use(
    http.get('/api/portal/reports', ({ request }) => {
      const query = new URL(request.url).searchParams;
      if (query.get('limit') === '1') return unreadResponse(3);
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
  const tabs = screen.getByRole('tablist', { name: 'Filter by status' });
  expect(await within(tabs).findByRole('tab', { name: 'Resolved 2' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await waitFor(() => expect(document.title).toBe('(3) My reports | BugPin'));
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
  expect(screen.getByRole('heading', { name: 'Deine Meldung' })).toBeVisible();
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
  ['closed', 'This report is closed'],
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
  expect(
    screen
      .queryAllByRole('link', { name: 'New report' })
      .some((link) => link.getAttribute('href') === '/new?projectId=project')
  ).toBe(state === 'closed');
});

it.each([
  [409, 'REPORT_CLOSED', 'This report is closed'],
  [403, 'MESSAGING_DISABLED', 'The team answers through other channels.'],
  [404, 'NOT_FOUND', 'Page not found'],
] as const)(
  'announces a %s reply failure once and recovers after permissions change',
  async (status, code, message) => {
    let state: 'initial' | 'denied' | 'restored' = 'initial';
    let finishRefetch!: () => void;
    const pending = new Promise<void>((resolve) => {
      finishRefetch = resolve;
    });
    server.use(
      http.get('/api/portal/reports/report', async () => {
        if (state !== 'denied') return HttpResponse.json({ success: true, report: detail });
        await pending;
        return status === 404
          ? HttpResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
          : HttpResponse.json({
              success: true,
              report: {
                ...detail,
                status: status === 409 ? 'closed' : 'resolved',
                canReply: false,
              },
            });
      }),
      http.post('/api/portal/reports/report/messages', () => {
        state = 'denied';
        return HttpResponse.json({ success: false, error: code }, { status });
      })
    );
    const client = mount('/reports/report');
    try {
      await userEvent.type(await screen.findByLabelText('Message'), 'Late reply');
      await userEvent.click(screen.getByRole('button', { name: 'Send' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      await act(async () => {
        finishRefetch();
        await pending;
      });
      await waitFor(() => expect(screen.queryByLabelText('Message')).not.toBeInTheDocument());
      expect(screen.getByText(message)).toBeVisible();
      expect(screen.getByRole('status')).toHaveTextContent(message);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      state = 'restored';
      await act(async () => {
        await client.invalidateQueries({ queryKey: ['portal', 'report', 'report'] });
      });
      expect(await screen.findByLabelText('Message')).toBeEnabled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      finishRefetch();
    }
  }
);

it.each([
  [409, 'REPORT_CLOSED', 'This report is closed'],
  [403, 'MESSAGING_DISABLED', 'The team answers through other channels.'],
  [404, 'NOT_FOUND', 'Page not found'],
] as const)(
  'keeps one accessible replacement when a %s reply rejection refreshes immediately',
  async (status, code, message) => {
    let denied = false;
    server.use(
      http.get('/api/portal/reports/report', () => {
        if (!denied) return HttpResponse.json({ success: true, report: detail });
        return status === 404
          ? HttpResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
          : HttpResponse.json({
              success: true,
              report: {
                ...detail,
                status: status === 409 ? 'closed' : 'resolved',
                canReply: false,
              },
            });
      }),
      http.post('/api/portal/reports/report/messages', () => {
        denied = true;
        return HttpResponse.json({ success: false, error: code }, { status });
      })
    );
    mount('/reports/report');
    await userEvent.type(await screen.findByLabelText('Message'), 'Late reply');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('status')).toHaveTextContent(message);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
  }
);

it.each([
  [403, 'MESSAGING_DISABLED'],
  [404, 'NOT_FOUND'],
  [409, 'REPORT_CLOSED'],
] as const)(
  'clears only a %s mutation error after a same-permission refresh and retains the draft through live updates',
  async (status, code) => {
    let rejected = false;
    let finishRefresh!: () => void;
    const pending = new Promise<void>((resolve) => {
      finishRefresh = resolve;
    });
    server.use(
      http.get('/api/portal/reports/report', async () => {
        if (rejected) await pending;
        return HttpResponse.json({ success: true, report: detail });
      })
    );
    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).endsWith('/reports/report/messages') && init?.method === 'POST') {
        rejected = true;
        expect((init.body as FormData).get('body')).toBe('Keep this draft');
        expect(((init.body as FormData).get('files[]') as File).name).toBe('draft.png');
        return Response.json({ success: false, error: code }, { status });
      }
      return originalFetch(input, init);
    });
    const client = mount('/reports/report');
    const user = userEvent.setup();
    try {
      await user.type(await screen.findByLabelText('Message'), 'Keep this draft');
      await user.upload(
        screen.getByLabelText('Files'),
        new File(['png'], 'draft.png', { type: 'image/png' })
      );
      await user.click(screen.getByRole('button', { name: 'Send' }));
      await screen.findByRole('alert');
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      await act(async () => {
        finishRefresh();
        await pending;
      });
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(screen.getByLabelText('Message')).toHaveValue('Keep this draft');
      expect(screen.getByText('draft.png')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
      const before = client.getQueryState(['portal', 'report', 'report'])!.dataUpdateCount;
      act(() => {
        TestEventSource.instances[0].dispatchEvent(new Event('report.updated'));
      });
      await waitFor(() =>
        expect(
          client.getQueryState(['portal', 'report', 'report'])!.dataUpdateCount
        ).toBeGreaterThan(before)
      );
      expect(screen.getByLabelText('Message')).toHaveValue('Keep this draft');
      expect(screen.getByText('draft.png')).toBeVisible();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      finishRefresh();
    }
  }
);

it('keeps a pending reply and its draft intact during an unrelated live refresh', async () => {
  let finishReply!: () => void;
  const pending = new Promise<void>((resolve) => {
    finishReply = resolve;
  });
  const originalFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input).endsWith('/reports/report/messages') && init?.method === 'POST') {
      await pending;
      return Response.json({ success: false, error: 'REPORT_CLOSED' }, { status: 409 });
    }
    return originalFetch(input, init);
  });
  const client = mount('/reports/report');
  const user = userEvent.setup();
  try {
    await user.type(await screen.findByLabelText('Message'), 'Pending draft');
    await user.upload(
      screen.getByLabelText('Files'),
      new File(['png'], 'pending.png', { type: 'image/png' })
    );
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['portal', 'report', 'report'] });
    });
    expect(screen.getByLabelText('Message')).toBeDisabled();
    expect(screen.getByLabelText('Message')).toHaveValue('Pending draft');
    expect(screen.getByText('pending.png')).toBeVisible();
    await act(async () => {
      finishReply();
      await pending;
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled());
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Message')).toHaveValue('Pending draft');
    expect(screen.getByText('pending.png')).toBeVisible();
  } finally {
    finishReply();
  }
});

it('submits a new report only to an eligible owned project and opens its detail', async () => {
  server.use(
    http.get('/api/portal/projects', () =>
      HttpResponse.json({
        success: true,
        projects: [project, { ...project, id: 'disabled', name: 'Hidden', allowNewReports: false }],
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

it('adds dropped files to a new report and rejects unsupported or oversized ones', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  mount('/new');
  const dropzone = await screen.findByRole('button', { name: 'Files' });
  await waitFor(() => expect(dropzone).toBeEnabled());
  expect(screen.getByText('Drag and drop files here')).toBeVisible();
  const drop = (files: File[]) =>
    fireEvent.drop(dropzone.parentElement!, { dataTransfer: { files, types: ['Files'] } });

  drop([new File(['png'], 'capture.png', { type: 'image/png' })]);
  expect(await screen.findByText('capture.png')).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();

  const addMore = screen.getByRole('button', { name: 'Files' });
  fireEvent.drop(addMore.closest('ul')!.parentElement!, {
    dataTransfer: { files: [new File(['txt'], 'notes.txt', { type: 'text/plain' })] },
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('up to 5');
  expect(screen.queryByText('notes.txt')).not.toBeInTheDocument();

  fireEvent.drop(addMore.closest('ul')!.parentElement!, {
    dataTransfer: {
      files: [new File([new Uint8Array(1024 * 1024 + 1)], 'large.png', { type: 'image/png' })],
    },
  });
  expect(screen.getByRole('alert')).toBeVisible();
  expect(screen.queryByText('large.png')).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Remove capture.png' }));
  expect(screen.queryByText('capture.png')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

it('clears private report content immediately on access changes and hides revoked reports', async () => {
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
    http.get('/api/portal/reports', ({ request }) => {
      if (new URL(request.url).searchParams.get('limit') !== '1') reads++;
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
    <ThemeProvider storageKey="bugpin-portal-theme">
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
    </ThemeProvider>
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
  expect(await screen.findByRole('heading', { name: 'Meine Meldungen' })).toBeVisible();
  expect(document.documentElement.lang).toBe('de');
});

it('shows no new report action when no owned project permits submissions', async () => {
  server.use(
    http.get('/api/portal/projects', () =>
      HttpResponse.json({ success: true, projects: [{ ...project, allowNewReports: false }] })
    )
  );
  mount('/new');
  expect(await screen.findByText('No project currently allows new reports.')).toBeVisible();
  expect(screen.queryByRole('link', { name: 'New report' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
});

it('paginates an individual board column without changing its full count or unread total', async () => {
  const cursors: (string | null)[] = [];
  server.use(
    http.get('/api/portal/reports', ({ request }) => {
      const query = new URL(request.url).searchParams;
      if (query.get('limit') === '1') return unreadResponse(2);
      const requested = query.get('status');
      if (requested === 'open') cursors.push(query.get('cursor'));
      const next = query.has('cursor');
      return HttpResponse.json({
        success: true,
        columns: Object.fromEntries(
          REPORT_STATUSES.map((status) => [
            status,
            {
              reports:
                status === 'open' && requested === 'open'
                  ? [
                      {
                        ...summary,
                        id: next ? 'next' : 'first',
                        title: next ? 'Next column item' : 'First column item',
                        status: 'open',
                      },
                    ]
                  : [],
              total: status === 'open' && requested === 'open' ? 50 : 0,
              nextCursor: status === 'open' && requested === 'open' && !next ? 'column-next' : null,
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
  await waitFor(() => expect(document.title).toBe('(2) My reports | BugPin'));
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
    await waitFor(() => expect(document.title).toBe('(7) My reports | BugPin'));
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

it('gives every media control a unique name and opens images in a lightbox', async () => {
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
  expect(screen.getByRole('button', { name: 'Play Video 1' })).toBeInTheDocument();
  for (const number of [1, 2, 3, 4]) {
    expect(screen.getByRole('button', { name: `View Attachment ${number}` })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `Download Attachment ${number}` })).toHaveAttribute(
      'download',
      `attachment-${number}.png`
    );
  }
  const names = [...screen.getAllByRole('button'), ...screen.getAllByRole('link')]
    .map((control) => control.getAttribute('aria-label') ?? '')
    .filter((name) => /^(View|Play|Download) /.test(name));
  expect(new Set(names).size).toBe(names.length);
  expect(
    screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/api/portal/files/'))
      .every((link) => link.getAttribute('target') !== '_blank')
  ).toBe(true);
  expect(screen.getAllByRole('link', { name: 'My reports' }).length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Show full report' })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'View Attachment 3' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByRole('img', { name: 'Full size image' })).toHaveAttribute(
    'src',
    '/api/portal/files/message-1-1'
  );
  await user.click(within(dialog).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: 'Play Video 1' }));
  const player = await screen.findByRole('dialog');
  expect(player.querySelector('video')).toHaveAttribute('src', '/api/portal/files/video');
});

it('shows status changes inline and the allowlisted captured details', async () => {
  server.use(
    http.get('/api/portal/reports/report', () =>
      HttpResponse.json({
        success: true,
        report: {
          ...detail,
          statusEvents: [
            {
              id: 'event',
              from: 'open',
              to: 'resolved',
              actorName: null,
              createdAt: '2026-11-01T12:00:00Z',
            },
          ],
          environment: {
            pageUrl: 'https://shop.example.test/checkout',
            browser: 'Chrome 131',
            os: 'Windows 11',
            viewport: { width: 1920, height: 1080 },
            timezone: 'Europe/Berlin',
          },
        },
      })
    )
  );
  mount('/reports/report');
  const conversation = await screen.findByRole('list', { name: 'Conversation' });
  const items = within(conversation).getAllByRole('listitem');
  expect(items.map((item) => item.textContent)).toEqual([
    expect.stringContaining('Earlier message'),
    expect.stringContaining('The team moved this from Open to Resolved'),
    expect.stringContaining('Can you share the browser?'),
  ]);
  expect(screen.getByRole('heading', { name: 'Captured with the report' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'shop.example.test/checkout' })).toHaveAttribute(
    'href',
    'https://shop.example.test/checkout'
  );
  for (const text of ['Chrome 131', 'Windows 11', '1920 × 1080', 'Europe/Berlin'])
    expect(screen.getByText(text)).toBeVisible();
});

it('shows a captured address that is not a web page as plain text', async () => {
  server.use(
    http.get('/api/portal/reports/report', () =>
      HttpResponse.json({
        success: true,
        report: {
          ...detail,
          environment: {
            pageUrl: 'javascript:alert(1)',
            browser: null,
            os: null,
            viewport: null,
            timezone: null,
          },
        },
      })
    )
  );
  mount('/reports/report');
  expect(await screen.findByText('javascript:alert(1)')).toBeVisible();
  expect(screen.queryByRole('link', { name: /alert/ })).not.toBeInTheDocument();
});

it('expands and collapses the original report on narrow screens', async () => {
  mount('/reports/report');
  const user = userEvent.setup();
  const toggle = await screen.findByRole('button', { name: 'Show full report' });
  await user.click(toggle);
  expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
    'aria-expanded',
    'true'
  );
  await user.click(screen.getByRole('button', { name: 'Show less' }));
  expect(screen.getByRole('button', { name: 'Show full report' })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
});

it('hides captured details when the report has none', async () => {
  mount('/reports/report');
  await screen.findByRole('heading', { name: detail.title });
  expect(
    screen.queryByRole('heading', { name: 'Captured with the report' })
  ).not.toBeInTheDocument();
});

it('switches the global email preference from the report page', async () => {
  const updates: unknown[] = [];
  server.use(
    http.patch('/api/portal/me', async ({ request }) => {
      const body = (await request.json()) as Partial<PortalMe>;
      updates.push(body);
      reporter = { ...reporter, ...body };
      return HttpResponse.json({ success: true, reporter });
    })
  );
  mount('/reports/report');
  const toggle = await screen.findByRole('switch', { name: 'Email notifications' });
  expect(toggle).toBeChecked();
  await userEvent.click(toggle);
  await waitFor(() => expect(updates).toEqual([{ emailUpdates: false }]));
  await waitFor(() => expect(toggle).not.toBeChecked());
});

it('persists the theme choice from the account menu', async () => {
  localStorage.removeItem('bugpin-portal-theme');
  mount();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Jane' }));
  const appearance = screen.getByRole('menuitem', { name: 'Appearance' });
  appearance.focus();
  await user.keyboard('{ArrowRight}');
  await user.click(await screen.findByRole('menuitemradio', { name: 'Dark' }));
  expect(document.documentElement).toHaveClass('dark');
  expect(localStorage.getItem('bugpin-portal-theme')).toBe('dark');
  cleanup();
  mount();
  await screen.findByRole('button', { name: 'Jane' });
  expect(document.documentElement).toHaveClass('dark');
});

it('links the BugPin footer unless white-label hides it', async () => {
  mount();
  const footer = await screen.findByRole('contentinfo');
  expect(footer).toHaveTextContent('Powered by BugPin');
  expect(within(footer).getByRole('link', { name: 'BugPin' })).toHaveAttribute(
    'href',
    'https://bugpin.io'
  );
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

it('offers the theme switch in the header before sign-in', async () => {
  localStorage.removeItem('bugpin-portal-theme');
  server.use(
    http.get('/api/portal/me', () =>
      HttpResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 })
    )
  );
  mount('/login');
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Appearance' }));
  await user.click(await screen.findByRole('menuitemradio', { name: 'Dark' }));
  expect(document.documentElement).toHaveClass('dark');
  await user.click(screen.getByRole('button', { name: 'Appearance' }));
  await user.click(await screen.findByRole('menuitemradio', { name: 'Light' }));
  expect(document.documentElement).toHaveClass('light');
  expect(localStorage.getItem('bugpin-portal-theme')).toBe('light');
});

it('invalidates private queries on SSE reconnect without resetting drafts or refetching public config', async () => {
  let configReads = 0;
  let reportReads = 0;
  server.use(
    http.get('/api/portal/config', () => {
      configReads++;
      return HttpResponse.json({
        success: true,
        config: {
          appName: 'BugPin',
          hideFooterBranding: false,
          branding: {
            buttonColors: {
              lightButtonColor: '#02658D',
              lightTextColor: '#ffffff',
              lightButtonHoverColor: '#024F6F',
              lightTextHoverColor: '#ffffff',
              darkButtonColor: '#02658D',
              darkTextColor: '#ffffff',
              darkButtonHoverColor: '#036F9B',
              darkTextHoverColor: '#ffffff',
            },
            logoLightUrl: null,
            logoDarkUrl: null,
            faviconLightVersion: '1',
            faviconDarkVersion: '1',
          },
        },
      });
    }),
    http.get('/api/portal/reports/report', () => {
      reportReads++;
      return HttpResponse.json({ success: true, report: detail });
    })
  );
  const client = mount('/reports/report');
  const resetSpy = vi.spyOn(client, 'resetQueries');
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Message'), 'Unsent reply draft');
  await user.upload(
    screen.getByLabelText('Files'),
    new File(['png'], 'keep.png', { type: 'image/png' })
  );
  const events = TestEventSource.instances[0];
  await act(async () => {
    await events.onerror?.();
  });
  expect(screen.getByRole('status')).toHaveTextContent('Reconnecting');
  const readsBeforeOpen = reportReads;
  act(() => events.onopen?.());
  await waitFor(() => expect(reportReads).toBeGreaterThan(readsBeforeOpen));
  expect(resetSpy).not.toHaveBeenCalled();
  expect(configReads).toBe(1);
  expect(screen.getByLabelText('Message')).toHaveValue('Unsent reply draft');
  expect(screen.getByText('keep.png')).toBeVisible();
});

it('handles access.changed with revoked=false via invalidation and revoked=true via resetQueries', async () => {
  let revoked = false;
  let reportReads = 0;
  server.use(
    http.get('/api/portal/reports/report', () => {
      reportReads++;
      if (revoked)
        return HttpResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 });
      return HttpResponse.json({ success: true, report: detail });
    })
  );
  const client = mount('/reports/report');
  const resetSpy = vi.spyOn(client, 'resetQueries');
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Message'), 'Keep draft on grant');
  const events = TestEventSource.instances[0];
  const readsBefore = reportReads;
  act(() => {
    events.dispatchEvent(
      new MessageEvent('access.changed', { data: JSON.stringify({ revoked: false }) })
    );
  });
  await waitFor(() => expect(reportReads).toBeGreaterThan(readsBefore));
  expect(resetSpy).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Message')).toHaveValue('Keep draft on grant');

  revoked = true;
  act(() => {
    events.dispatchEvent(
      new MessageEvent('access.changed', { data: JSON.stringify({ revoked: true }) })
    );
  });
  expect(resetSpy).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(['portal', 'report', 'report'])).toBeUndefined();
  expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeVisible();
});

it('clears the offline banner after signing out and signing back in', async () => {
  server.use(http.post('/api/portal/auth/logout', () => HttpResponse.json({ success: true })));
  mount('/reports');
  await screen.findByRole('button', { name: 'Jane' });
  const events = TestEventSource.instances[0];
  await act(async () => {
    await events.onerror?.();
  });
  expect(screen.getByRole('status')).toHaveTextContent('Reconnecting');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Jane' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
  await screen.findByLabelText('Email address');
  expect(screen.queryByText('Connection lost. Reconnecting…')).not.toBeInTheDocument();
});

it('maps non-JSON 413 responses to PAYLOAD_TOO_LARGE and other non-JSON errors to REQUEST_FAILED', async () => {
  server.use(
    http.post(
      '/api/portal/reports/report/messages',
      () =>
        new HttpResponse('<html>413 Request Entity Too Large</html>', {
          status: 413,
          headers: { 'Content-Type': 'text/html' },
        })
    ),
    http.get(
      '/api/portal/reports/bad-gateway',
      () =>
        new HttpResponse('Bad Gateway', { status: 502, headers: { 'Content-Type': 'text/plain' } })
    )
  );
  await expect(portalFetch('/reports/report/messages', { method: 'POST' })).rejects.toMatchObject({
    status: 413,
    code: 'PAYLOAD_TOO_LARGE',
  } satisfies Partial<PortalApiError>);
  await expect(portalFetch('/reports/bad-gateway')).rejects.toMatchObject({
    status: 502,
    code: 'REQUEST_FAILED',
  } satisfies Partial<PortalApiError>);
});

it('accepts parameterized MIME types in FilePicker and suppresses zero-MB hints without a project', async () => {
  mount('/reports/report');
  const user = userEvent.setup({ applyAccept: false });
  const input = await screen.findByLabelText('Files');
  const recording = new File(['webm'], 'clip.webm', { type: 'video/webm;codecs=vp9' });
  await user.upload(input, recording);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByText('clip.webm')).toBeVisible();

  await user.upload(input, new File(['bad'], 'notes.txt', { type: 'text/plain;charset=utf-8' }));
  expect(await screen.findByRole('alert')).toBeVisible();

  cleanup();
  mount('/new?projectId=not-owned');
  expect(await screen.findByLabelText('Title')).toBeDisabled();
  expect(screen.queryByText(/Images: 0 MB/)).not.toBeInTheDocument();
});

it('ignores and removes a stale projectId query parameter once accessible projects load', async () => {
  const seenProjectIds: (string | null)[] = [];
  server.use(
    http.get('/api/portal/reports', ({ request }) => {
      const query = new URL(request.url).searchParams;
      if (query.get('limit') === '1') return unreadResponse(0);
      const pid = query.get('projectId');
      seenProjectIds.push(pid);
      return HttpResponse.json({
        success: true,
        reports: pid ? [] : [summary],
        nextCursor: null,
        total: pid ? 0 : 1,
        unreadCount: 0,
        statusCounts,
      });
    })
  );
  mount('/reports?projectId=removed-project');
  expect(await screen.findByRole('link', { name: /Checkout button/ })).toBeVisible();
  expect(seenProjectIds[seenProjectIds.length - 1]).toBeNull();
});

it('keeps a 413 upload quota error in the composer across a background report refresh', async () => {
  const originalFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input).endsWith('/reports/report/messages') && init?.method === 'POST') {
      return Response.json({ success: false, error: 'UPLOAD_QUOTA_EXCEEDED' }, { status: 413 });
    }
    return originalFetch(input, init);
  });
  const client = mount('/reports/report');
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Message'), 'Quota draft');
  await user.click(screen.getByRole('button', { name: 'Send' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('upload quota');
  const before = client.getQueryState(['portal', 'report', 'report'])!.dataUpdateCount;
  act(() => {
    TestEventSource.instances[0].dispatchEvent(new Event('report.updated'));
  });
  await waitFor(() =>
    expect(client.getQueryState(['portal', 'report', 'report'])!.dataUpdateCount).toBeGreaterThan(
      before
    )
  );
  expect(screen.getByRole('alert')).toHaveTextContent('upload quota');
  expect(screen.getByLabelText('Message')).toHaveValue('Quota draft');
});
