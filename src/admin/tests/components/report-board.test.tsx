import { afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReportStatus } from '@shared/types';
import {
  ReportBoard,
  type BoardSelection,
  type ReportBoardLabels,
  type ReportBoardColumnData,
} from '@shared-ui/components/report-board/ReportBoard';
import {
  DraggableReportBoard,
  moveGroupInOrder,
  moveInOrder,
  placementOf,
  type BoardOrder,
} from '../../components/report-board/DraggableReportBoard';
import { ReportViewSwitcher } from '@shared-ui/components/report-board/ReportViewSwitcher';

interface Item {
  id: string;
  status: ReportStatus;
  title: string;
}

const labels: Record<ReportStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

function column(
  status: ReportStatus,
  items: Item[],
  overrides: Partial<ReportBoardColumnData<Item>> = {}
): ReportBoardColumnData<Item> {
  return {
    status,
    items,
    total: items.length,
    loading: false,
    loadingMore: false,
    hasMore: false,
    onLoadMore: vi.fn(),
    ...overrides,
  };
}

const crash: Item = { id: 'r1', status: 'open', title: 'Crash on save' };
const typo: Item = { id: 'r2', status: 'in_progress', title: 'Typo in footer' };

function boardProps(columns: ReportBoardColumnData<Item>[]) {
  return {
    columns,
    statusLabels: labels,
    collapsed: [] as ReportStatus[],
    onToggleCollapsed: vi.fn(),
    getItemLabel: (item: Item) => item.title,
    renderCard: (item: Item) => <p>{item.title}</p>,
    onOpen: vi.fn(),
  };
}

describe('ReportBoard', () => {
  it('renders one column per status with its server total', () => {
    render(
      <ReportBoard
        {...boardProps([
          column('open', [crash], { total: 12 }),
          column('in_progress', [typo]),
          column('resolved', []),
        ])}
      />
    );

    expect(screen.getByRole('region', { name: 'Open, 12 reports' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'In Progress, 1 report' })).toBeInTheDocument();
    const resolved = screen.getByRole('region', { name: 'Resolved, 0 reports' });
    expect(within(resolved).getByText('No reports')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Closed/ })).not.toBeInTheDocument();
  });

  it('opens a report when its card is clicked', async () => {
    const user = userEvent.setup();
    const props = boardProps([column('open', [crash])]);
    render(<ReportBoard {...props} />);

    await user.click(screen.getByRole('button', { name: 'Open Crash on save' }));

    expect(props.onOpen).toHaveBeenCalledWith(crash);
  });

  it('loads more cards and shows how many remain', async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    render(
      <ReportBoard
        {...boardProps([column('open', [crash], { total: 30, hasMore: true, onLoadMore })])}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Show more (29 remaining)' }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('collapses and expands columns through the handler', async () => {
    const user = userEvent.setup();
    const props = boardProps([column('open', [crash]), column('closed', [], { total: 40 })]);
    render(<ReportBoard {...props} collapsed={['closed']} />);

    expect(
      screen.getByRole('region', { name: 'Closed, 40 reports, collapsed' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand Closed' }));
    await user.click(screen.getByRole('button', { name: 'Collapse Open' }));

    expect(props.onToggleCollapsed).toHaveBeenNthCalledWith(1, 'closed');
    expect(props.onToggleCollapsed).toHaveBeenNthCalledWith(2, 'open');
  });

  it('shows card actions only where the caller provides them', () => {
    render(
      <ReportBoard
        {...boardProps([column('open', [crash]), column('in_progress', [typo])])}
        renderCardActions={(item) =>
          item.id === 'r1' ? <button type="button">Actions</button> : undefined
        }
      />
    );

    expect(screen.getAllByRole('button', { name: 'Actions' })).toHaveLength(1);
  });

  it('renders the cards with drag and drop enabled', () => {
    render(
      <DraggableReportBoard
        {...boardProps([column('open', [crash]), column('in_progress', [typo])])}
        canMove={() => true}
        onReorder={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Open Crash on save' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'In Progress, 1 report' })).toBeInTheDocument();
  });
});

describe('ReportBoard localization', () => {
  it('uses caller text for counts, actions, pagination, and errors', async () => {
    const user = userEvent.setup();
    const props = boardProps([
      column('open', [crash], { total: 3, hasMore: true }),
      column('in_progress', [typo]),
      column('closed', [], { error: true, onRetry: vi.fn() }),
    ]);
    const select = selection(['r1']);
    const labels: ReportBoardLabels = {
      columnSummary: (label: string, total: number, collapsed: boolean) =>
        `${label}: ${total}${collapsed ? ' zu' : ''}`,
      selectAll: (label: string) => `Alle in ${label} auswählen`,
      deselectAll: (label: string) => `Alle in ${label} abwählen`,
      collapseColumn: (label: string) => `${label} zuklappen`,
      expandColumn: (label: string) => `${label} aufklappen`,
      openCard: (label: string, selected: boolean) =>
        `${label} ansehen${selected ? ' (ausgewählt)' : ''}`,
      loadMore: (remaining: number) => `${remaining} weitere`,
      loadError: 'Laden fehlgeschlagen',
      retry: 'Erneut versuchen',
    };
    const { rerender } = render(<ReportBoard {...props} labels={labels} selection={select} />);

    expect(screen.getByRole('region', { name: 'Open: 3' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Crash on save ansehen (ausgewählt)' }));
    await user.click(screen.getByRole('button', { name: '2 weitere' }));
    await user.click(screen.getByRole('button', { name: 'Open zuklappen' }));
    await user.click(screen.getByRole('button', { name: 'Alle in Open abwählen' }));
    await user.click(screen.getByRole('button', { name: 'Alle in In Progress auswählen' }));
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Laden fehlgeschlagen');
    expect(props.onOpen).toHaveBeenCalledWith(crash);
    expect(props.columns[0].onLoadMore).toHaveBeenCalledOnce();
    expect(props.columns[2].onRetry).toHaveBeenCalledOnce();
    expect(select.onSelectColumn).toHaveBeenNthCalledWith(1, 'open');
    expect(select.onSelectColumn).toHaveBeenNthCalledWith(2, 'in_progress');

    rerender(<ReportBoard {...props} labels={labels} collapsed={['open']} />);
    expect(screen.getByRole('region', { name: 'Open: 3 zu' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open aufklappen' }));
    expect(props.onToggleCollapsed).toHaveBeenCalledTimes(2);
  });

  it('keeps default labels when only the retry text is overridden', async () => {
    const user = userEvent.setup();
    const props = boardProps([
      column('open', [crash], { total: 3, hasMore: true }),
      column('closed', [], { error: true, onRetry: vi.fn() }),
    ]);
    render(<ReportBoard {...props} labels={{ retry: 'Erneut versuchen' }} />);

    expect(screen.getByRole('region', { name: 'Open, 3 reports' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Crash on save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse Open' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load reports");
    await user.click(screen.getByRole('button', { name: 'Show more (2 remaining)' }));
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(props.columns[0].onLoadMore).toHaveBeenCalledOnce();
    expect(props.columns[1].onRetry).toHaveBeenCalledOnce();
  });
});

describe('ReportBoard loading errors', () => {
  it('shows a retry instead of the empty text when a column fails to load', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ReportBoard {...boardProps([column('open', [], { error: true, onRetry })])} />);

    const open = screen.getByRole('region', { name: 'Open, 0 reports' });
    expect(within(open).getByRole('alert')).toHaveTextContent("Couldn't load reports");
    expect(within(open).queryByText('No reports')).not.toBeInTheDocument();

    await user.click(within(open).getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('keeps loaded cards and offers a retry in place of Show more when the next page fails', () => {
    render(
      <ReportBoard
        {...boardProps([
          column('open', [crash], { total: 3, hasMore: true, error: true, onRetry: vi.fn() }),
        ])}
      />
    );

    expect(screen.getByRole('button', { name: 'Open Crash on save' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load reports");
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument();
  });
});

describe('DraggableReportBoard keyboard', () => {
  it('explains the keyboard controls on each movable card', async () => {
    render(
      <DraggableReportBoard
        {...boardProps([column('open', [crash])])}
        canMove={() => true}
        onReorder={vi.fn()}
      />
    );

    const card = screen.getByRole('button', { name: 'Open Crash on save' });
    await waitFor(() => expect(card).toHaveAttribute('aria-describedby'));
    const description = document.getElementById(card.getAttribute('aria-describedby') ?? '');
    expect(description).toHaveTextContent('press the space bar');
    expect(description).toHaveTextContent('Press enter to open the card');
  });

  it('does not open a movable card when Space is released, but still opens it on click', () => {
    const props = boardProps([column('open', [crash])]);
    render(<DraggableReportBoard {...props} canMove={() => true} onReorder={vi.fn()} />);
    const card = screen.getByRole('button', { name: 'Open Crash on save' });

    fireEvent.keyUp(card, { key: ' ' });
    fireEvent.click(card);
    expect(props.onOpen).not.toHaveBeenCalled();

    fireEvent.click(card);
    expect(props.onOpen).toHaveBeenCalledOnce();
  });

  it('opens a card that cannot move when Space is released', () => {
    const props = boardProps([column('open', [crash])]);
    render(<DraggableReportBoard {...props} canMove={() => false} onReorder={vi.fn()} />);
    const card = screen.getByRole('button', { name: 'Open Crash on save' });

    fireEvent.keyUp(card, { key: ' ' });
    fireEvent.click(card);
    expect(props.onOpen).toHaveBeenCalledOnce();
  });
});

function selection(selected: string[] = []): BoardSelection {
  return {
    selectedIds: new Set(selected),
    onSelect: vi.fn(),
    onSelectColumn: vi.fn(),
    onChange: vi.fn(),
    onClear: vi.fn(),
  };
}

function lastChange(select: BoardSelection): Set<string> | undefined {
  const calls = vi.mocked(select.onChange).mock.calls;
  return calls[calls.length - 1]?.[0];
}

describe('ReportBoard selection', () => {
  afterEach(() => vi.restoreAllMocks());

  it('toggles with Cmd or Ctrl + click, extends with Shift + click, and opens on a plain click', () => {
    const select = selection();
    const props = boardProps([column('open', [crash])]);
    render(<ReportBoard {...props} selection={select} />);
    const card = screen.getByRole('button', { name: 'Open Crash on save' });

    fireEvent.click(card, { metaKey: true });
    fireEvent.click(card, { ctrlKey: true });
    fireEvent.click(card, { shiftKey: true });
    fireEvent.click(card);

    expect(vi.mocked(select.onSelect).mock.calls).toEqual([
      ['r1', 'toggle'],
      ['r1', 'toggle'],
      ['r1', 'range'],
    ]);
    expect(props.onOpen).toHaveBeenCalledOnce();
  });

  it('opens cards on modifier clicks when the board has no selection', () => {
    const props = boardProps([column('open', [crash])]);
    render(<ReportBoard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Crash on save' }), { metaKey: true });

    expect(props.onOpen).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /all in Open/ })).not.toBeInTheDocument();
  });

  it('marks selected cards and selects or deselects a whole column', async () => {
    const user = userEvent.setup();
    const select = selection(['r1']);
    render(
      <ReportBoard
        {...boardProps([column('open', [crash]), column('in_progress', [typo])])}
        selection={select}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Open Crash on save, selected' })
    ).toBeInTheDocument();
    const deselect = screen.getByRole('button', { name: 'Deselect all in Open' });
    expect(deselect).toHaveAttribute('aria-pressed', 'true');
    await user.click(deselect);
    await user.click(screen.getByRole('button', { name: 'Select all in In Progress' }));

    expect(vi.mocked(select.onSelectColumn).mock.calls).toEqual([['open'], ['in_progress']]);
  });

  it('selects the cards a rectangle drawn from empty space touches', () => {
    const select = selection(['r2']);
    const boxes: Record<string, DOMRect> = {
      r1: new DOMRect(0, 0, 100, 50),
      r2: new DOMRect(0, 200, 100, 50),
    };
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element
    ) {
      const id = this instanceof HTMLElement ? this.dataset.boardCardId : undefined;
      return id ? boxes[id] : new DOMRect(0, 0, 1000, 1000);
    });
    const { container } = render(
      <ReportBoard
        {...boardProps([column('open', [crash, { ...typo, status: 'open' }])])}
        selection={select}
      />
    );
    const board = container.firstElementChild as HTMLElement;

    fireEvent.pointerDown(board, { button: 0, pointerId: 1, clientX: 150, clientY: 10 });
    fireEvent.pointerMove(board, { pointerId: 1, clientX: 50, clientY: 40 });
    fireEvent.pointerUp(board, { pointerId: 1, clientX: 50, clientY: 40 });

    expect(lastChange(select)).toEqual(new Set(['r1']));
    expect(select.onClear).not.toHaveBeenCalled();

    fireEvent.pointerDown(board, {
      button: 0,
      pointerId: 2,
      clientX: 150,
      clientY: 10,
      shiftKey: true,
    });
    fireEvent.pointerMove(board, { pointerId: 2, clientX: 50, clientY: 40 });
    fireEvent.pointerUp(board, { pointerId: 2 });

    expect(lastChange(select)).toEqual(new Set(['r1', 'r2']));
  });

  it('clears the selection on a click on empty space or Escape, but not from a card press', () => {
    const select = selection(['r1']);
    const { container } = render(
      <ReportBoard {...boardProps([column('open', [crash])])} selection={select} />
    );
    const board = container.firstElementChild as HTMLElement;

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open Crash on save, selected' }), {
      button: 0,
      pointerId: 1,
    });
    expect(select.onClear).not.toHaveBeenCalled();

    fireEvent.pointerDown(board, { button: 0, pointerId: 2, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(board, { pointerId: 2, clientX: 5, clientY: 5 });
    expect(select.onClear).toHaveBeenCalledOnce();

    fireEvent.keyDown(board, { key: 'Escape' });
    expect(select.onClear).toHaveBeenCalledTimes(2);
  });
});

describe('board order helpers', () => {
  const order: BoardOrder = {
    open: ['a', 'b', 'c'],
    in_progress: ['d'],
    resolved: [],
    closed: [],
  };

  it('moves a card within its column', () => {
    expect(moveInOrder(order, 'a', 'open', 2).open).toEqual(['b', 'c', 'a']);
    expect(moveInOrder(order, 'c', 'open', 0).open).toEqual(['c', 'a', 'b']);
  });

  it('moves a card into another column at the given index', () => {
    const next = moveInOrder(order, 'b', 'in_progress', 0);
    expect(next.open).toEqual(['a', 'c']);
    expect(next.in_progress).toEqual(['b', 'd']);
    expect(moveInOrder(order, 'b', 'resolved', 5).resolved).toEqual(['b']);
  });

  it('returns the same order when nothing changes or the card is unknown', () => {
    expect(moveInOrder(order, 'b', 'open', 1)).toBe(order);
    expect(moveInOrder(order, 'x', 'open', 0)).toBe(order);
  });

  it('gathers a group of cards at a position, in the given order', () => {
    expect(
      moveGroupInOrder(order, ['a', 'c'], { status: 'in_progress', previousId: 'd', nextId: null })
    ).toEqual({ open: ['b'], in_progress: ['d', 'a', 'c'], resolved: [], closed: [] });
    expect(
      moveGroupInOrder(order, ['c', 'd'], { status: 'open', previousId: null, nextId: 'a' })
    ).toEqual({ open: ['c', 'd', 'a', 'b'], in_progress: [], resolved: [], closed: [] });
    expect(
      moveGroupInOrder(order, ['a'], { status: 'open', previousId: 'gone', nextId: null })
    ).toEqual({ open: ['b', 'c', 'a'], in_progress: ['d'], resolved: [], closed: [] });
  });

  it('describes a card by its column and neighbors', () => {
    expect(placementOf(order, 'b')).toEqual({ status: 'open', previousId: 'a', nextId: 'c' });
    expect(placementOf(order, 'd')).toEqual({
      status: 'in_progress',
      previousId: null,
      nextId: null,
    });
    expect(placementOf(order, 'x')).toBeNull();
  });
});

describe('ReportViewSwitcher', () => {
  it('keeps default labels when only the board label is overridden', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ReportViewSwitcher value="list" onChange={onChange} labels={{ board: 'Tafel' }} />);

    expect(screen.getByRole('tablist', { name: 'Report view' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Tafel' }));
    expect(onChange).toHaveBeenCalledWith('board');
  });

  it('uses caller labels without changing view values', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ReportViewSwitcher
        value="list"
        onChange={onChange}
        labels={{ view: 'Ansicht', list: 'Liste', board: 'Tafel' }}
      />
    );

    expect(screen.getByRole('tablist', { name: 'Ansicht' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Liste' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Tafel' }));
    expect(onChange).toHaveBeenCalledWith('board');
  });

  it('reports the chosen view', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ReportViewSwitcher value="list" onChange={onChange} />);

    expect(screen.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Board' }));

    expect(onChange).toHaveBeenCalledWith('board');
  });
});
