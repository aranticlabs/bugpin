import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ComponentProps } from 'react';
import { toast } from 'sonner';
import type { Report, ReportStatus } from '@shared/types';
import { server } from '../../mocks/server';
import { mockReports as untypedReports } from '../../mocks/handlers';
import { renderWithProviders } from '../../utils';
import { Reports } from '../../../pages/workspace/Reports';
import type { DraggableReportBoard as DraggableReportBoardType } from '../../../components/report-board/DraggableReportBoard';

type DraggableProps = ComponentProps<typeof DraggableReportBoardType<Report>>;

// The shared mocks keep statuses and priorities as plain strings.
const mockReports = untypedReports as unknown as Report[];

// jsdom has no layout, so the drag sensors cannot run; the board's drop callback is driven directly.
const board: { props: DraggableProps | null } = { props: null };

vi.mock('../../../components/report-board/DraggableReportBoard', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../../components/report-board/DraggableReportBoard')>();
  const { ReportBoard } = await import('@shared-ui/components/report-board/ReportBoard');
  return {
    ...original,
    DraggableReportBoard: (props: DraggableProps) => {
      board.props = props;
      const { onReorder: _onReorder, ...rest } = props;
      return <ReportBoard {...rest} />;
    },
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

interface Move {
  id: string;
  body: Record<string, unknown>;
}

/** A fake server that keeps each column in order and applies the moves it accepts */
function boardServer() {
  const columns: Record<ReportStatus, Report[]> = {
    open: mockReports.filter((report) => report.status === 'open'),
    in_progress: mockReports.filter((report) => report.status === 'in_progress'),
    resolved: [],
    closed: [],
  };
  const moves: Move[] = [];
  const listRequests: URLSearchParams[] = [];
  let failMoves = false;

  const place = (id: string, status: ReportStatus, previousId?: unknown, nextId?: unknown) => {
    const report = Object.values(columns)
      .flat()
      .find((candidate) => candidate.id === id);
    if (!report) return;
    for (const key of Object.keys(columns) as ReportStatus[]) {
      columns[key] = columns[key].filter((candidate) => candidate.id !== id);
    }
    const target = columns[status];
    const previousIndex = target.findIndex((candidate) => candidate.id === previousId);
    const nextIndex = target.findIndex((candidate) => candidate.id === nextId);
    const index = previousIndex !== -1 ? previousIndex + 1 : nextIndex !== -1 ? nextIndex : 0;
    target.splice(index, 0, { ...report, status });
  };

  server.use(
    http.get('/api/user-preferences/me', () =>
      HttpResponse.json({ success: true, preferences: { reportsView: 'board' } })
    ),
    http.get('/api/reports', ({ request }) => {
      const params = new URL(request.url).searchParams;
      listRequests.push(params);
      const data = columns[params.get('status') as ReportStatus] ?? [];
      return HttpResponse.json({
        success: true,
        data,
        total: data.length,
        page: 1,
        limit: 20,
        totalPages: 1,
        nextCursor: null,
      });
    }),
    http.post('/api/reports/bulk-board-position', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown> & { ids: string[] };
      moves.push({ id: body.ids.join(','), body });
      if (failMoves) {
        return HttpResponse.json(
          { success: false, error: 'NOT_FOUND', message: 'Report not found' },
          { status: 404 }
        );
      }
      body.ids.forEach((id, index) =>
        place(
          id,
          body.status as ReportStatus,
          index === 0 ? body.previousId : body.ids[index - 1],
          body.nextId
        )
      );
      return HttpResponse.json({ success: true, reports: [] });
    }),
    http.post('/api/reports/bulk-update', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      moves.push({ id: 'bulk-update', body });
      return HttpResponse.json({ success: true, updated: 2 });
    }),
    http.patch('/api/reports/:id/board-position', async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      moves.push({ id: String(params.id), body });
      if (failMoves) {
        return HttpResponse.json(
          { success: false, error: 'NOT_FOUND', message: 'Report not found' },
          { status: 404 }
        );
      }
      place(String(params.id), body.status as ReportStatus, body.previousId, body.nextId);
      return HttpResponse.json({ success: true, report: {} });
    }),
    http.patch('/api/reports/:id', async ({ params, request }) => {
      const body = (await request.json()) as { status: ReportStatus };
      moves.push({ id: String(params.id), body });
      place(String(params.id), body.status);
      return HttpResponse.json({ success: true, report: {} });
    })
  );

  return {
    moves,
    listRequests,
    failNextMoves: () => {
      failMoves = true;
    },
  };
}

function cardTitles(columnName: RegExp): string[] {
  return within(screen.getByRole('region', { name: columnName }))
    .queryAllByRole('button', { name: /^Open / })
    .map((button) => button.getAttribute('aria-label')?.replace(/^Open /, '') ?? '');
}

function report(id: string): Report {
  const found = mockReports.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown report ${id}`);
  return found;
}

async function drop(
  id: string,
  placement: { status: ReportStatus; previousId: string | null; nextId: string | null },
  origin: { status: ReportStatus; previousId: string | null; nextId: string | null }
) {
  await waitFor(() => expect(board.props).not.toBeNull());
  await act(async () => {
    board.props?.onReorder(report(id), placement, origin);
  });
}

describe('reports board moves', () => {
  beforeEach(() => {
    window.localStorage.clear();
    board.props = null;
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });
  afterEach(() => window.localStorage.clear());

  it('saves a drop between its neighbors and shows the card there', async () => {
    const api = boardServer();
    renderWithProviders(<Reports />, { initialEntries: ['/reports'] });
    await screen.findByRole('region', { name: 'Open, 2 reports' });

    await drop(
      'report-1',
      { status: 'in_progress', previousId: null, nextId: 'report-2' },
      { status: 'open', previousId: null, nextId: 'report-3' }
    );

    await waitFor(() =>
      expect(cardTitles(/^In Progress/)).toEqual(['Button not working', 'Page layout broken'])
    );
    await waitFor(() =>
      expect(api.moves).toEqual([
        {
          id: 'report-1',
          body: { status: 'in_progress', previousId: null, nextId: 'report-2' },
        },
      ])
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Moved "Button not working" to In Progress',
        expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) })
      )
    );
  });

  it('saves the sorted order only for the reports the board shows, then switches to Manual', async () => {
    const api = boardServer();
    renderWithProviders(<Reports />, {
      initialEntries: [
        '/reports?sort=priority&dir=desc&status=open,in_progress&priority=high,bogus&projectId=project-1&assignedTo=__me__&search=crash',
      ],
    });
    await screen.findByRole('region', { name: /^Open, / });

    await drop(
      'report-3',
      { status: 'open', previousId: null, nextId: 'report-1' },
      { status: 'open', previousId: 'report-1', nextId: null }
    );

    await waitFor(() => expect(api.moves).toHaveLength(1));
    expect(api.moves[0].body.adoptSort).toEqual({
      sortBy: 'priority',
      sortOrder: 'desc',
      scope: {
        projectId: 'project-1',
        status: ['open', 'in_progress'],
        priority: ['high'],
        assignedTo: '__me__',
        search: 'crash',
      },
    });
    await waitFor(() =>
      expect(api.listRequests.some((params) => params.get('sortBy') === 'position')).toBe(true)
    );
    expect(toast.success).toHaveBeenCalledWith('Switched the board to Manual order');
  });

  it('puts only the failed card back where it was', async () => {
    const api = boardServer();
    renderWithProviders(<Reports />, { initialEntries: ['/reports'] });
    await screen.findByRole('region', { name: 'Open, 2 reports' });
    expect(cardTitles(/^Open/)).toEqual(['Button not working', 'Form validation issue']);
    api.failNextMoves();

    await drop(
      'report-1',
      { status: 'resolved', previousId: null, nextId: null },
      { status: 'open', previousId: null, nextId: 'report-3' }
    );

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Report not found'));
    expect(cardTitles(/^Resolved/)).toEqual([]);
    expect(cardTitles(/^Open/)).toEqual(['Button not working', 'Form validation issue']);
  });

  it('undoes a menu move back to the spot the card came from', async () => {
    const user = userEvent.setup();
    const api = boardServer();
    renderWithProviders(<Reports />, { initialEntries: ['/reports'] });

    await user.click(
      await screen.findByRole('button', { name: 'Actions for Form validation issue' })
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Closed' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());

    const [, options] = vi.mocked(toast.success).mock.calls[0];
    const action = (options as { action?: { onClick: () => void } }).action;
    await act(async () => action?.onClick());

    await waitFor(() => expect(api.moves).toHaveLength(2));
    expect(api.moves[1]).toEqual({
      id: 'report-3',
      body: { status: 'open', previousId: 'report-1', nextId: null },
    });
    await waitFor(() =>
      expect(cardTitles(/^Open/)).toEqual(['Button not working', 'Form validation issue'])
    );
  });
});

describe('reports board selection', () => {
  beforeEach(() => {
    window.localStorage.clear();
    board.props = null;
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });
  afterEach(() => window.localStorage.clear());

  it('selects cards with Cmd + click and changes them from the bulk bar', async () => {
    const user = userEvent.setup();
    const api = boardServer();
    renderWithProviders(<Reports />, { initialEntries: ['/reports'] });

    fireEvent.click(await screen.findByRole('button', { name: 'Open Button not working' }), {
      metaKey: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Page layout broken' }), {
      metaKey: true,
    });

    expect(await screen.findByText('2 reports selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Set Status' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Closed' }));

    await waitFor(() =>
      expect(api.moves).toEqual([
        {
          id: 'bulk-update',
          body: { ids: ['report-1', 'report-2'], updates: { status: 'closed' } },
        },
      ])
    );
    await waitFor(() => expect(screen.queryByText(/reports? selected$/)).not.toBeInTheDocument());
  });

  it('selects and deselects a card from its menu', async () => {
    const user = userEvent.setup();
    boardServer();
    renderWithProviders(<Reports />, { initialEntries: ['/reports'] });

    await user.click(await screen.findByRole('button', { name: 'Actions for Button not working' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Select' }));
    expect(await screen.findByText('1 report selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Actions for Button not working' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Deselect' }));
    await waitFor(() => expect(screen.queryByText('1 report selected')).not.toBeInTheDocument());
  });

  it('moves the selected cards together as one block', async () => {
    const api = boardServer();
    renderWithProviders(<Reports />, { initialEntries: ['/reports'] });
    await screen.findByRole('region', { name: 'Open, 2 reports' });
    await waitFor(() => expect(board.props?.onReorderGroup).toBeDefined());

    await act(async () => {
      board.props?.onReorderGroup?.([report('report-1'), report('report-3')], {
        status: 'in_progress',
        previousId: 'report-2',
        nextId: null,
      });
    });

    await waitFor(() =>
      expect(cardTitles(/^In Progress/)).toEqual([
        'Page layout broken',
        'Button not working',
        'Form validation issue',
      ])
    );
    expect(cardTitles(/^Open/)).toEqual([]);
    await waitFor(() =>
      expect(api.moves).toEqual([
        {
          id: 'report-1,report-3',
          body: {
            ids: ['report-1', 'report-3'],
            status: 'in_progress',
            previousId: 'report-2',
            nextId: null,
          },
        },
      ])
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Moved 2 reports to In Progress', {
        description: undefined,
      })
    );
  });

  it('puts every card of a failed group move back where it was', async () => {
    const api = boardServer();
    renderWithProviders(<Reports />, { initialEntries: ['/reports'] });
    await screen.findByRole('region', { name: 'Open, 2 reports' });
    await waitFor(() => expect(board.props?.onReorderGroup).toBeDefined());
    api.failNextMoves();

    await act(async () => {
      board.props?.onReorderGroup?.([report('report-1'), report('report-3')], {
        status: 'closed',
        previousId: null,
        nextId: null,
      });
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Report not found'));
    expect(cardTitles(/^Closed/)).toEqual([]);
    expect(cardTitles(/^Open/)).toEqual(['Button not working', 'Form validation issue']);
  });
});

describe('reports board columns', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  function savedView(view: 'list' | 'board') {
    server.use(
      http.get('/api/user-preferences/me', () =>
        HttpResponse.json({ success: true, preferences: { reportsView: view } })
      )
    );
  }

  it('loads the next page with a cursor and shows each card once', async () => {
    const user = userEvent.setup();
    savedView('board');
    const cursors: (string | null)[] = [];
    const [first, second] = [report('report-1'), report('report-3')];
    server.use(
      http.get('/api/reports', ({ request }) => {
        const params = new URL(request.url).searchParams;
        const page = (data: Report[], nextCursor: string | null) =>
          HttpResponse.json({
            success: true,
            data,
            total: 2,
            page: 1,
            limit: 20,
            totalPages: 1,
            nextCursor,
          });
        if (params.get('status') !== 'open') return page([], null);
        cursors.push(params.get('after'));
        return params.get('after') === 'cursor-1'
          ? page([first, second], null)
          : page([first], 'cursor-1');
      })
    );

    renderWithProviders(<Reports />, { initialEntries: ['/reports'] });

    await user.click(await screen.findByRole('button', { name: /Show more \(1 remaining\)/ }));

    await waitFor(() =>
      expect(cardTitles(/^Open/)).toEqual(['Button not working', 'Form validation issue'])
    );
    expect(cursors).toEqual([null, 'cursor-1']);
  });

  it('shows a retry in a column that failed to load', async () => {
    const user = userEvent.setup();
    savedView('board');
    let closedFails = true;
    server.use(
      http.get('/api/reports', ({ request }) => {
        const status = new URL(request.url).searchParams.get('status');
        if (status === 'closed' && closedFails) return HttpResponse.error();
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

    const closed = await screen.findByRole('region', { name: /^Closed/ });
    expect(await within(closed).findByRole('alert')).toHaveTextContent("Couldn't load reports");
    expect(within(closed).queryByText('No reports')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: /^Open/ })).getByText('No reports')
    ).toBeInTheDocument();

    closedFails = false;
    await user.click(within(closed).getByRole('button', { name: 'Retry' }));

    expect(await within(closed).findByText('No reports')).toBeInTheDocument();
    expect(within(closed).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('opens the view named in the URL over the saved one', async () => {
    savedView('list');

    renderWithProviders(<Reports />, { initialEntries: ['/reports?view=board'] });

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Open, 2 reports' })).toBeInTheDocument()
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('starts the list on its first page after switching views', async () => {
    const user = userEvent.setup();
    savedView('list');
    const pages: (string | null)[] = [];
    server.use(
      http.get('/api/reports', ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (!params.get('status')) pages.push(params.get('page'));
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

    renderWithProviders(<Reports />, { initialEntries: ['/reports?page=3'] });
    await waitFor(() => expect(pages).toEqual(['3']));

    await user.click(screen.getByRole('tab', { name: 'Board' }));
    await screen.findByRole('region', { name: /^Open, / });
    await user.click(screen.getByRole('tab', { name: 'List' }));

    await waitFor(() => expect(pages[pages.length - 1]).toBe('1'));
  });
});
