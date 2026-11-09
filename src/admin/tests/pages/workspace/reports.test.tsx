import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { mockReports, mockUsers } from '../../mocks/handlers';
import { Route, Routes } from 'react-router-dom';
import { createTestQueryClient, renderWithProviders } from '../../utils';
import { ReportDetail } from '../../../pages/workspace/ReportDetail';
import { Reports } from '../../../pages/workspace/Reports';
import { api } from '../../../api/client';

describe('Reports Page', () => {
  it.each(['list', 'board'])(
    'keeps the new-activity filter in the %s view and renders its indicator',
    async (view) => {
      const requests: URLSearchParams[] = [];
      server.use(
        http.get('/api/reports', ({ request }) => {
          const params = new URL(request.url).searchParams;
          requests.push(params);
          const data =
            !params.has('status') || params.get('status') === 'open'
              ? [{ ...mockReports[0], hasNewReporterActivity: true }]
              : [];
          return HttpResponse.json({
            success: true,
            data,
            total: data.length,
            page: 1,
            limit: 20,
            totalPages: 1,
          });
        })
      );
      const user = userEvent.setup();
      renderWithProviders(<Reports />, {
        initialEntries: [`/reports?reporterActivity=new&view=${view}`],
      });
      await waitFor(() =>
        expect(
          screen.getAllByRole('img', { name: 'New reporter activity' }).length
        ).toBeGreaterThan(0)
      );
      expect(requests.every((params) => params.get('reporterActivity') === 'new')).toBe(true);
      await user.click(screen.getByRole('combobox', { name: 'Filter by reporter activity' }));
      await user.click(await screen.findByRole('option', { name: 'All activity' }));
      await waitFor(() =>
        expect(requests.some((params) => !params.has('reporterActivity'))).toBe(true)
      );
    }
  );

  it.each(['list', 'board'])(
    'keeps the reporter filter in the %s view and lets staff clear it',
    async (view) => {
      const requests: URLSearchParams[] = [];
      server.use(
        http.get('/api/reports', ({ request }) => {
          requests.push(new URL(request.url).searchParams);
          return HttpResponse.json({
            success: true,
            data: [],
            total: 0,
            page: 1,
            limit: 20,
            totalPages: 0,
          });
        })
      );
      const user = userEvent.setup();
      renderWithProviders(<Reports />, {
        initialEntries: [`/reports?reporterId=rptr_jane&view=${view}`],
      });
      await waitFor(() => expect(requests.length).toBeGreaterThanOrEqual(view === 'board' ? 4 : 1));
      expect(requests.every((params) => params.get('reporterId') === 'rptr_jane')).toBe(true);
      if (view === 'board')
        expect(new Set(requests.map((params) => params.get('status')))).toEqual(
          new Set(['open', 'in_progress', 'resolved', 'closed'])
        );
      await user.click(screen.getByRole('button', { name: 'Clear reporter filter' }));
      await waitFor(() => expect(requests.some((params) => !params.has('reporterId'))).toBe(true));
      expect(screen.queryByText('Filtered by reporter')).not.toBeInTheDocument();
    }
  );

  it('renders reports page heading', async () => {
    renderWithProviders(<Reports />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
  });

  it('renders without crashing', () => {
    renderWithProviders(<Reports />);
    expect(document.body).toBeInTheDocument();
  });

  it('displays table structure', async () => {
    renderWithProviders(<Reports />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  it('displays table headers', async () => {
    renderWithProviders(<Reports />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    // Check for common table headers
    const headers = screen.getAllByRole('columnheader');
    expect(headers.length).toBeGreaterThan(0);
  });

  it('displays table rows after loading', async () => {
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        // Table should have rows (including header row)
        const rows = screen.getAllByRole('row');
        expect(rows.length).toBeGreaterThanOrEqual(1);
      },
      { timeout: 5000 }
    );
  });

  it('handles empty reports state', async () => {
    server.use(
      http.get('/api/reports', () => {
        return HttpResponse.json({
          success: true,
          data: [],
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        });
      })
    );

    renderWithProviders(<Reports />);

    // Table should render but body should be empty
    await waitFor(
      () => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });

  it('navigates to the next page', async () => {
    const requestedPages: string[] = [];
    const user = userEvent.setup();

    server.use(
      http.get('/api/reports', ({ request }) => {
        const url = new URL(request.url);
        const page = url.searchParams.get('page') || '1';
        requestedPages.push(page);

        const reportTitle = page === '2' ? 'Second page issue' : 'First page issue';

        return HttpResponse.json({
          success: true,
          data: [
            {
              id: `report-${page}`,
              source: 'widget',
              title: reportTitle,
              status: 'open',
              priority: 'medium',
              projectId: 'project-1',
              projectName: 'Test Project',
              createdAt: '2024-01-15T10:30:00Z',
              updatedAt: '2024-01-15T10:30:00Z',
              metadata: { timestamp: '2024-01-15T10:30:00Z' },
            },
          ],
          total: 60,
          page: Number(page),
          limit: 10,
          totalPages: 6,
        });
      })
    );

    renderWithProviders(<Reports />, {
      initialEntries: ['/reports?page=1'],
    });

    await waitFor(() => {
      expect(screen.getAllByText('First page issue')[0]).toBeInTheDocument();
    });

    expect(screen.getAllByText('60 reports')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Page 1 of 6')[0]).toBeInTheDocument();
    const nextButtons = screen.getAllByRole('button', { name: 'Next page' });
    await user.click(nextButtons[nextButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getAllByText('Second page issue')[0]).toBeInTheDocument();
    });

    expect(requestedPages).toContain('2');
  });

  it('requests the chosen page size and starts again on the first page', async () => {
    const requests: { page: string; limit: string }[] = [];
    const user = userEvent.setup();

    server.use(
      http.get('/api/reports', ({ request }) => {
        const url = new URL(request.url);
        requests.push({
          page: url.searchParams.get('page') ?? '',
          limit: url.searchParams.get('limit') ?? '',
        });
        return HttpResponse.json({
          success: true,
          data: [],
          total: 60,
          page: Number(url.searchParams.get('page')),
          limit: Number(url.searchParams.get('limit')),
          totalPages: 3,
        });
      })
    );

    renderWithProviders(<Reports />, { initialEntries: ['/reports?page=2'] });

    await waitFor(() => expect(requests).toContainEqual({ page: '2', limit: '10' }));
    const pageSizeTriggers = await screen.findAllByRole('combobox', { name: 'Rows per page' });
    await user.click(pageSizeTriggers[pageSizeTriggers.length - 1]);
    await user.click(await screen.findByRole('option', { name: '25' }));

    await waitFor(() => expect(requests).toContainEqual({ page: '1', limit: '25' }));
  });
});

describe('Reports Page - GitHub Sync Status', () => {
  it('displays all column headers including checkbox', async () => {
    renderWithProviders(<Reports />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    // Check for all column headers
    const headers = screen.getAllByRole('columnheader');
    expect(headers.length).toBe(8); // Checkbox, Report, Project, Status, Priority, Assignee, GitHub, Created
  });

  it('shows synced status with link to GitHub issue', async () => {
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        // Look for the synced report's row
        expect(screen.getAllByText('Button not working')[0]).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Should have a link to the GitHub issue
    const githubLinks = screen.getAllByRole('link', { name: '' });
    const githubLink = githubLinks.find((el) => el.getAttribute('href')?.includes('github.com'));
    expect(githubLink).toHaveAttribute('href', 'https://github.com/testorg/testrepo/issues/42');
  });

  it('shows pending sync status indicator', async () => {
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        expect(screen.getAllByText('Form validation issue')[0]).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // The pending report should show a loading spinner (Loader2 component)
    // We can check for the presence of the animate-spin class
    const spinners = document.querySelectorAll('.animate-spin');
    expect(spinners.length).toBeGreaterThan(0);
  });

  it('shows error sync status indicator', async () => {
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        expect(screen.getAllByText('Page layout broken')[0]).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // The error report should show an alert circle icon
    // We verify by checking the text-destructive class exists
    const errorIndicators = document.querySelectorAll('.text-destructive');
    expect(errorIndicators.length).toBeGreaterThan(0);
  });

  it('shows tooltip on hover for synced reports', async () => {
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        expect(screen.getAllByText('Button not working')[0]).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // The synced indicator should be inside a TooltipTrigger
    const githubLinks = screen.getAllByRole('link', { name: '' });
    const githubLink = githubLinks.find((el) => el.getAttribute('href')?.includes('github.com'));
    expect(githubLink).toBeInTheDocument();
  });
});

describe('Reports Page - Bulk Actions', () => {
  it('renders checkboxes in table rows', async () => {
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        expect(screen.getAllByText('Button not working')[0]).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Should have multiple checkboxes (header + rows)
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThan(1);
  });

  it('shows assignee names in the list', async () => {
    renderWithProviders(<Reports />);

    await waitFor(() => {
      expect(screen.getAllByText('Editor User')[0]).toBeInTheDocument();
    });
  });

  it('shows bulk actions toolbar when reports are selected', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        expect(screen.getAllByText('Button not working')[0]).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Click a checkbox to select a report
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]); // First row checkbox (not header)

    // Bulk actions toolbar should appear
    await waitFor(() => {
      expect(screen.getByText(/1 report selected/)).toBeInTheDocument();
    });

    // Action buttons should be visible
    expect(screen.getByRole('button', { name: /Set Status/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Set Priority/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Share/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();
  });

  it('opens share dropdown with excel and csv options', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        expect(screen.getAllByText('Button not working')[0]).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);

    await waitFor(() => {
      expect(screen.getByText(/1 report selected/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Share/i }));

    expect(await screen.findByText(/Download Excel/i)).toBeInTheDocument();
    expect(screen.getByText(/Download CSV/i)).toBeInTheDocument();
  });

  it('filters reports by assignee', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Reports />);

    await waitFor(() => {
      expect(screen.getAllByText('Button not working')[0]).toBeInTheDocument();
    });

    const assigneeComboboxes = screen.getAllByRole('combobox');
    await user.click(assigneeComboboxes[3]);
    const assigneeOptions = await screen.findAllByText('Editor User');
    await user.click(assigneeOptions[assigneeOptions.length - 1]);

    await waitFor(() => {
      expect(screen.getAllByText('Button not working')[0]).toBeInTheDocument();
      expect(screen.queryByText('Page layout broken')).not.toBeInTheDocument();
    });
  });

  it('creates a manual report from the modal', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        success: true,
        report: {
          id: 'report-new',
          source: 'manual',
          title: 'Escalated QA issue',
          status: 'open',
          priority: 'medium',
          projectId: 'project-1',
          createdAt: '2024-01-17T12:00:00Z',
          updatedAt: '2024-01-17T12:00:00Z',
          metadata: {
            timestamp: '2024-01-17T12:00:00Z',
            manualContext: {
              channel: 'qa',
              submittedByUserId: 'user-1',
            },
          },
        },
      },
    } as never);

    const user = userEvent.setup();
    renderWithProviders(<Reports />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Report' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Create Report' }));
    await user.type(screen.getByLabelText('Title'), 'Escalated QA issue');
    await user.type(screen.getByLabelText('Description'), 'Created manually from support.');
    await user.type(screen.getByLabelText('URL'), 'bugpin.io');
    await user.tab();
    const createButtons = screen.getAllByRole('button', { name: 'Create Report' });
    await user.click(createButtons[createButtons.length - 1]);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalled();
    });

    const formData = postSpy.mock.calls[0]?.[1] as FormData;
    const data = JSON.parse(String(formData.get('data') ?? '{}')) as {
      title?: string;
      url?: string;
    };
    expect(data.title).toBe('Escalated QA issue');
    expect(data.url).toBe('https://bugpin.io');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument();
    });
    postSpy.mockRestore();
  });

  it('selects all reports when header checkbox is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        expect(screen.getAllByText('Button not working')[0]).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Click the "Select all" header checkbox
    const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all/i });
    await user.click(selectAllCheckbox);

    // Should show multiple reports selected
    await waitFor(() => {
      expect(screen.getByText(/reports selected/)).toBeInTheDocument();
    });
  });

  it('clears selection when Clear button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        expect(screen.getAllByText('Button not working')[0]).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Select a report
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);

    await waitFor(() => {
      expect(screen.getByText(/1 report selected/)).toBeInTheDocument();
    });

    // Click Clear button
    await user.click(screen.getByRole('button', { name: /Clear/i }));

    // Toolbar should disappear
    await waitFor(() => {
      expect(screen.queryByText(/report selected/)).not.toBeInTheDocument();
    });
  });

  it('shows delete confirmation dialog when Delete is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        expect(screen.getAllByText('Button not working')[0]).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Select a report
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);

    await waitFor(() => {
      expect(screen.getByText(/1 report selected/)).toBeInTheDocument();
    });

    // Click Delete button
    await user.click(screen.getByRole('button', { name: /Delete/i }));

    // Confirmation dialog should appear
    await waitFor(() => {
      expect(screen.getByText(/Delete 1 reports\?/)).toBeInTheDocument();
      expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument();
    });
  });
});

describe('Reports back link', () => {
  function renderFlow(entry: string, queryClient = createTestQueryClient()) {
    return renderWithProviders(
      <Routes>
        <Route path="/reports" element={<Reports />} />
        <Route path="/projects/:id" element={<Reports projectId="project-1" />} />
        <Route path="/reports/:id" element={<ReportDetail />} />
      </Routes>,
      { initialEntries: [entry], queryClient }
    );
  }

  async function openFirstReport() {
    const user = userEvent.setup();
    await user.click((await screen.findAllByText('Button not working'))[0]);
    return user;
  }

  it('links back to the project the report was opened from', async () => {
    const queryClient = createTestQueryClient();
    renderFlow('/projects/project-1', queryClient);
    await waitFor(() => expect(queryClient.getQueryData(['project-summaries'])).toBeDefined());
    const user = await openFirstReport();

    const back = await screen.findByRole('button', { name: 'Back to Test Project' });
    await user.click(back);
    expect(await screen.findAllByText('Button not working')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: /^Back to/ })).not.toBeInTheDocument();
  });

  it('links back to the filtered reports list', async () => {
    renderFlow('/reports?priority=high');
    await openFirstReport();

    expect(await screen.findByRole('button', { name: 'Back to Reports' })).toBeInTheDocument();
  });
});

describe('Reports Page - Sorting', () => {
  it('sorts by a column on the server and flips the direction on a second click', async () => {
    const requests: { sortBy: string; sortOrder: string; page: string }[] = [];
    const user = userEvent.setup();

    server.use(
      http.get('/api/reports', ({ request }) => {
        const url = new URL(request.url);
        requests.push({
          sortBy: url.searchParams.get('sortBy') ?? '',
          sortOrder: url.searchParams.get('sortOrder') ?? '',
          page: url.searchParams.get('page') ?? '',
        });
        return HttpResponse.json({
          success: true,
          data: [],
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
        });
      })
    );

    renderWithProviders(<Reports />, { initialEntries: ['/reports?page=3'] });

    await waitFor(() =>
      expect(requests).toContainEqual({ sortBy: 'createdAt', sortOrder: 'desc', page: '3' })
    );
    const created = screen.getByRole('button', { name: /^created/i });
    expect(created.closest('th')).toHaveAttribute('aria-sort', 'descending');

    await user.click(screen.getByRole('button', { name: /^priority/i }));
    await waitFor(() =>
      expect(requests).toContainEqual({ sortBy: 'priority', sortOrder: 'desc', page: '1' })
    );

    await user.click(screen.getByRole('button', { name: /^priority/i }));
    await waitFor(() =>
      expect(requests).toContainEqual({ sortBy: 'priority', sortOrder: 'asc', page: '1' })
    );

    await user.click(screen.getByRole('button', { name: /^report/i }));
    await waitFor(() =>
      expect(requests).toContainEqual({ sortBy: 'title', sortOrder: 'asc', page: '1' })
    );
    expect(screen.getByRole('button', { name: /^report/i }).closest('th')).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
  });

  describe('board view', () => {
    beforeEach(() => window.localStorage.clear());
    afterEach(() => window.localStorage.clear());

    function savedView(view: 'list' | 'board') {
      server.use(
        http.get('/api/user-preferences/me', () =>
          HttpResponse.json({ success: true, preferences: { reportsView: view } })
        )
      );
    }

    function recordStatusRequests(): string[] {
      const statuses: string[] = [];
      server.use(
        http.get('/api/reports', ({ request }) => {
          const status = new URL(request.url).searchParams.get('status') ?? '';
          statuses.push(status);
          const data = mockReports.filter((report) => !status || report.status === status);
          return HttpResponse.json({
            success: true,
            data,
            total: data.length,
            page: 1,
            limit: 20,
            totalPages: data.length > 0 ? 1 : 0,
          });
        })
      );
      return statuses;
    }

    it('loads each status column separately and shows its total', async () => {
      savedView('board');
      const statuses = recordStatusRequests();

      renderWithProviders(<Reports />, { initialEntries: ['/reports'] });

      expect(await screen.findByRole('region', { name: 'Open, 2 reports' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'In Progress, 1 report' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Resolved, 0 reports' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Closed, 0 reports' })).toBeInTheDocument();
      expect(new Set(statuses.filter(Boolean))).toEqual(
        new Set(['open', 'in_progress', 'resolved', 'closed'])
      );
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sort cards' })).toBeInTheDocument();
    });

    it('shows only the columns that match the status filter', async () => {
      savedView('board');
      const statuses = recordStatusRequests();

      renderWithProviders(<Reports />, { initialEntries: ['/reports?status=open,in_progress'] });

      expect(await screen.findByRole('region', { name: 'Open, 2 reports' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'In Progress, 1 report' })).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: /^Resolved/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('region', { name: /^Closed/ })).not.toBeInTheDocument();
      expect(statuses).not.toContain('resolved');
      expect(statuses).not.toContain('closed');
    });

    it('orders the board by hand by default and keeps the list on its own sort', async () => {
      const user = userEvent.setup();
      const sorts: string[] = [];
      savedView('board');
      server.use(
        http.get('/api/reports', ({ request }) => {
          const params = new URL(request.url).searchParams;
          sorts.push(
            `${params.get('status') ?? 'all'}:${params.get('sortBy')}:${params.get('sortOrder')}`
          );
          return HttpResponse.json({
            success: true,
            data: [],
            total: 0,
            page: 1,
            limit: 20,
            totalPages: 0,
          });
        })
      );

      renderWithProviders(<Reports />, { initialEntries: ['/reports'] });

      await waitFor(() => expect(sorts).toContain('open:position:asc'));
      await user.click(screen.getByRole('button', { name: 'Sort cards' }));
      expect(await screen.findByRole('menuitemradio', { name: 'Manual' })).toHaveAttribute(
        'aria-checked',
        'true'
      );
      await user.keyboard('{Escape}');

      await user.click(screen.getByRole('tab', { name: 'List' }));
      await waitFor(() => expect(sorts).toContain('all:createdAt:desc'));
    });

    it('sorts the cards from the sort button', async () => {
      const user = userEvent.setup();
      const sorts: string[] = [];
      savedView('board');
      server.use(
        http.get('/api/reports', ({ request }) => {
          const params = new URL(request.url).searchParams;
          sorts.push(`${params.get('sortBy')}:${params.get('sortOrder')}`);
          return HttpResponse.json({
            success: true,
            data: [],
            total: 0,
            page: 1,
            limit: 20,
            totalPages: 0,
          });
        })
      );

      renderWithProviders(<Reports />, { initialEntries: ['/reports'] });

      await user.click(await screen.findByRole('button', { name: 'Sort cards' }));
      await user.click(await screen.findByRole('menuitemradio', { name: 'Priority' }));

      await waitFor(() => expect(sorts).toContain('priority:desc'));
    });

    it('remembers the board when the user switches views', async () => {
      const user = userEvent.setup();
      const saved: unknown[] = [];
      server.use(
        http.patch('/api/user-preferences/me', async ({ request }) => {
          const body = await request.json();
          saved.push(body);
          return HttpResponse.json({ success: true, preferences: body });
        })
      );

      renderWithProviders(<Reports />, { initialEntries: ['/reports'] });

      await screen.findByRole('table');
      await user.click(screen.getByRole('tab', { name: 'Board' }));

      expect(await screen.findByRole('region', { name: /^Open, / })).toBeInTheDocument();
      await waitFor(() => expect(saved).toContainEqual({ reportsView: 'board' }));
    });

    it('changes the status through the card menu', async () => {
      const user = userEvent.setup();
      const updates: { id: string; body: unknown }[] = [];
      savedView('board');
      recordStatusRequests();
      server.use(
        http.patch('/api/reports/:id', async ({ params, request }) => {
          const body = await request.json();
          updates.push({ id: String(params.id), body });
          return HttpResponse.json({ success: true, report: {} });
        })
      );

      renderWithProviders(<Reports />, { initialEntries: ['/reports'] });

      await user.click(
        await screen.findByRole('button', { name: 'Actions for Button not working' })
      );
      await user.click(await screen.findByRole('menuitem', { name: 'Resolved' }));

      await waitFor(() =>
        expect(updates).toEqual([{ id: 'report-1', body: { status: 'resolved' } }])
      );
    });

    it('shows a read-only board to viewers', async () => {
      savedView('board');
      recordStatusRequests();
      server.use(
        http.get('/api/auth/me', () =>
          HttpResponse.json({ success: true, authenticated: true, user: mockUsers.viewer })
        )
      );

      renderWithProviders(<Reports />, { initialEntries: ['/reports'] });

      expect(await screen.findByRole('region', { name: 'Open, 2 reports' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open Button not working' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
    });
  });
});
