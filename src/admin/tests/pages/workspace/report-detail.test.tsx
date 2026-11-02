import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, screen, userEvent, waitFor } from '../../utils';
import { ReportDetail } from '../../../pages/workspace/ReportDetail';
import { server } from '../../mocks/server';
import { mockReports } from '../../mocks/handlers';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { toast } from 'sonner';

describe('ReportDetail', () => {
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

    expect(await screen.findByText('Screenshots (2)')).toBeInTheDocument();
    const video = document.querySelector('video');
    expect(video).toHaveAttribute('preload', 'metadata');
    expect(video).toHaveStyle({ maxHeight: '200px' });
    expect(video).toHaveClass('object-contain');
    expect(screen.getByRole('img', { name: 'screen.png' })).toHaveStyle({ maxHeight: '200px' });

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
