import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { Link, Routes, Route } from 'react-router-dom';
import { renderWithProviders, screen, userEvent, waitFor, within } from '../../utils';
import { ReportDetail } from '../../../pages/workspace/ReportDetail';
import { server } from '../../mocks/server';
import { mockConversationMessages } from '../../mocks/reporter-messages';
import { mockReports } from '../../mocks/handlers';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { toast } from 'sonner';

afterEach(() => vi.clearAllMocks());

describe('ReportDetail', () => {
  it('shows the Owner field and refreshes it after removal', async () => {
    let hasOwner = true;
    server.use(
      http.get('/api/reports/report-1', () =>
        HttpResponse.json({
          success: true,
          report: {
            ...mockReports[0],
            reporterId: hasOwner ? 'rptr_jane' : undefined,
            owner: {
              reporterId: hasOwner ? 'rptr_jane' : null,
              claimableEmail: null,
              correspondentEmail: 'contact@example.com',
              reporter: hasOwner
                ? {
                    id: 'rptr_jane',
                    email: 'jane@example.com',
                    displayName: 'Jane',
                    lastLoginAt: null,
                  }
                : null,
            },
          },
          files: [],
        })
      ),
      http.delete('/api/reports/report-1/owner', () => {
        hasOwner = false;
        return HttpResponse.json({ success: true });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/reports/:id" element={<ReportDetail />} />
      </Routes>,
      { initialEntries: ['/reports/report-1'] }
    );
    expect(await screen.findByText('j***@example.com')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Remove owner' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove owner' })
    );
    expect(await screen.findByText('No owner')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove owner' })).not.toBeInTheDocument();
  });

  beforeEach(() => vi.clearAllMocks());
  it('places the conversation after Description and keeps it enabled when update emails are off', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/reports/:id" element={<ReportDetail />} />
      </Routes>,
      { initialEntries: ['/reports/report-1'] }
    );
    const conversation = await screen.findByRole('region', { name: 'Conversation' });
    const description = screen.getByText('The submit button does not respond to clicks');
    expect(
      description.compareDocumentPosition(conversation) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(conversation.parentElement?.parentElement).toContainElement(description);
    expect(screen.getByRole('textbox', { name: 'Message to reporter' })).toBeInTheDocument();
  });

  it('sends a resolution message through the shared conversation and refreshes the thread', async () => {
    const sent: unknown[] = [];
    let messages: typeof mockConversationMessages = [];
    server.use(
      http.get('/api/reports/:id/reporter-messages', () =>
        HttpResponse.json({ success: true, messages })
      ),
      http.post('/api/reports/:id/reporter-messages', async ({ request }) => {
        const body = (await request.json()) as { message: string; ccSender: boolean };
        sent.push(body);
        const message = { ...mockConversationMessages[0], message: body.message, files: [] };
        messages = [message];
        return HttpResponse.json({ success: true, reporterMessage: message });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/reports/:id" element={<ReportDetail />} />
      </Routes>,
      { initialEntries: ['/reports/report-1'] }
    );
    await screen.findByRole('region', { name: 'Conversation' });
    await user.click(screen.getAllByRole('combobox')[0]);
    await user.click(await screen.findByText('Resolved'));
    await user.click(
      await screen.findByRole('button', { name: 'Send a message to the reporter?' })
    );
    await user.type(
      screen.getByPlaceholderText('Optional message to send to the reporter...'),
      'Resolved with a workaround'
    );
    await user.click(screen.getAllByRole('checkbox', { name: 'Send me a copy' })[1]);
    await user.click(screen.getAllByRole('button', { name: 'Send Message' })[1]);
    await waitFor(() =>
      expect(sent).toEqual([{ message: 'Resolved with a workaround', ccSender: true }])
    );
    expect(await screen.findByText('Resolved with a workaround')).toBeInTheDocument();
  });

  it('isolates resolution failures from the composer and resets them on report navigation', async () => {
    server.use(
      http.post('/api/reports/:id/reporter-messages', async () => {
        await delay(100);
        return HttpResponse.json({ message: 'Resolution delivery failed' }, { status: 400 });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route
          path="/reports/:id"
          element={
            <>
              <Link to="/reports/report-3">Next report</Link>
              <ReportDetail />
            </>
          }
        />
      </Routes>,
      { initialEntries: ['/reports/report-1'] }
    );
    const conversation = await screen.findByRole('region', { name: 'Conversation' });
    await user.type(within(conversation).getByRole('textbox'), 'Composer draft');
    await user.click(screen.getAllByRole('combobox')[0]);
    await user.click(await screen.findByText('Resolved'));
    await user.click(
      await screen.findByRole('button', { name: 'Send a message to the reporter?' })
    );
    await user.type(
      screen.getByPlaceholderText('Optional message to send to the reporter...'),
      'Resolution draft'
    );
    await user.click(screen.getAllByRole('button', { name: 'Send Message' })[1]);
    expect(within(conversation).getByRole('textbox')).toBeEnabled();
    expect(within(conversation).getByRole('button', { name: 'Send Message' })).toBeEnabled();
    expect(await screen.findByText('Resolution delivery failed')).toBeInTheDocument();
    expect(within(conversation).queryByText('Resolution delivery failed')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Optional message to send to the reporter...')).toHaveValue(
      'Resolution draft'
    );
    expect(within(conversation).getByRole('textbox')).toHaveValue('Composer draft');
    expect(toast.error).not.toHaveBeenCalled();
    await user.click(screen.getByRole('link', { name: 'Next report' }));
    await screen.findByText(mockReports[2].title);
    expect(screen.queryByText('Resolution delivery failed')).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('Optional message to send to the reporter...')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message to reporter' })).toHaveValue('');
    await user.click(screen.getAllByRole('combobox')[0]);
    await user.click(await screen.findByText('Resolved'));
    await user.click(
      await screen.findByRole('button', { name: 'Send a message to the reporter?' })
    );
    expect(screen.getByPlaceholderText('Optional message to send to the reporter...')).toHaveValue(
      ''
    );
    expect(screen.queryByText('Resolution delivery failed')).not.toBeInTheDocument();
  });

  it('records the report as recently viewed once it loads', async () => {
    const viewed: string[] = [];
    server.use(
      http.post('/api/reports/:id/views', ({ params }) => {
        viewed.push(String(params.id));
        return HttpResponse.json({ success: true });
      })
    );
    renderWithProviders(
      <Routes>
        <Route path="/reports/:id" element={<ReportDetail />} />
      </Routes>,
      { initialEntries: ['/reports/report-1'] }
    );

    expect(await screen.findByText('Button not working')).toBeInTheDocument();
    await waitFor(() => expect(viewed).toEqual(['report-1']));
  });

  it('auto-saves status and priority changes inline', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/reports/:id" element={<ReportDetail />} />
      </Routes>,
      { initialEntries: ['/reports/report-1'] }
    );

    expect(await screen.findByText('Button not working')).toBeInTheDocument();
    expect(screen.getByText('Editor User')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();

    const [statusSelect, prioritySelect] = screen.getAllByRole('combobox');

    await user.click(statusSelect);
    await user.click(await screen.findByText('Resolved'));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Report updated successfully');
    });

    await user.click(prioritySelect);
    await user.click(await screen.findByText('Low'));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(2);
    });
  });

  it('auto-saves assignee changes inline', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/reports/:id" element={<ReportDetail />} />
      </Routes>,
      { initialEntries: ['/reports/report-1'] }
    );

    expect(await screen.findByText('Button not working')).toBeInTheDocument();

    const assigneeSelect = screen.getAllByRole('combobox')[2];
    await user.click(assigneeSelect);
    await user.click(await screen.findByText('Admin User'));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Report updated successfully');
    });
  });

  it('shows media lightbox and video previews', async () => {
    server.use(
      http.get('/api/reports/:id', ({ params }) => {
        const report = mockReports.find((item) => item.id === params.id);
        return HttpResponse.json({
          success: true,
          report,
          files: [
            { id: 'file-1', mimeType: 'image/png', filename: 'screen.png' },
            { id: 'file-2', mimeType: 'video/mp4', filename: 'clip.mp4' },
          ],
        });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/reports/:id" element={<ReportDetail />} />
      </Routes>,
      { initialEntries: ['/reports/report-1'] }
    );

    expect(await screen.findByText('Media (2)')).toBeInTheDocument();
    const video = document.querySelector('video');
    expect(video).toHaveAttribute('preload', 'metadata');
    expect(video).toHaveClass('max-h-50');
    expect(video).toHaveClass('object-contain');
    expect(screen.getByRole('img', { name: 'screen.png' })).toHaveClass('max-h-50');

    await user.click(screen.getByRole('img', { name: 'screen.png' }));
    expect(await screen.findByText('Open in new tab')).toBeInTheDocument();
  });

  it('renders not found state when report is missing', async () => {
    server.use(
      http.get('/api/reports/:id', () => {
        return HttpResponse.json({ success: false, message: 'Report not found' }, { status: 404 });
      })
    );

    renderWithProviders(
      <Routes>
        <Route path="/reports/:id" element={<ReportDetail />} />
      </Routes>,
      { initialEntries: ['/reports/missing'] }
    );

    expect(await screen.findByText('Report not found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Reports' })).toBeInTheDocument();
  });

  it('goes back to the page the report was opened from', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/reports/:id" element={<ReportDetail />} />
        <Route path="/" element={<p>Dashboard page</p>} />
      </Routes>,
      {
        initialEntries: [
          {
            pathname: '/reports/report-1',
            state: { reportOrigin: { path: '/', label: 'Dashboard' } },
          },
        ],
      }
    );

    await user.click(await screen.findByRole('button', { name: 'Back to Dashboard' }));
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
  });

  it('ignores an origin that points off the console', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/reports/:id" element={<ReportDetail />} />
      </Routes>,
      {
        initialEntries: [
          {
            pathname: '/reports/report-1',
            state: { reportOrigin: { path: '//evil.example', label: 'Elsewhere' } },
          },
        ],
      }
    );

    expect(await screen.findByRole('button', { name: 'Back to Reports' })).toBeInTheDocument();
  });

  it('retries GitHub sync when status is error', async () => {
    server.use(
      http.get('/api/reports/:id', ({ params }) => {
        const report = mockReports.find((item) => item.id === params.id);
        return HttpResponse.json({
          success: true,
          report: { ...report, githubSyncStatus: 'error', githubSyncError: 'Rate limit' },
          files: [],
        });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/reports/:id" element={<ReportDetail />} />
      </Routes>,
      { initialEntries: ['/reports/report-1'] }
    );

    expect(await screen.findByText('Sync failed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry sync/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Sync retry initiated');
    });
  });

  it('renders manual reports without empty environment placeholders', async () => {
    server.use(
      http.get('/api/reports/:id', () => {
        return HttpResponse.json({
          success: true,
          report: {
            ...mockReports[2],
            source: 'manual',
            metadata: {
              timestamp: '2024-01-16T08:00:00Z',
              manualContext: {
                channel: 'email',
                submittedByUserId: 'user-1',
              },
            },
          },
          files: [],
        });
      })
    );

    renderWithProviders(
      <Routes>
        <Route path="/reports/:id" element={<ReportDetail />} />
      </Routes>,
      { initialEntries: ['/reports/report-3'] }
    );

    expect(await screen.findByText('Form validation issue')).toBeInTheDocument();
    expect(screen.getAllByText('manual')[0]).toBeInTheDocument();
    expect(screen.getByText('Manual Report')).toBeInTheDocument();
    expect(screen.queryByText('Environment')).not.toBeInTheDocument();
  });
});
